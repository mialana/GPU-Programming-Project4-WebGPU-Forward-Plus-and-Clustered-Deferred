import * as renderer from "../renderer";
import * as shaders from "../shaders/shaders";
import { Stage } from "../stage/stage";

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    blitBindGroupLayout: GPUBindGroupLayout; // new groups for G-Buffer
    blitBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;
    blitPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout =
            stage.lights.clusteringComputeBindGroupLayout;

        this.sceneUniformsBindGroup = stage.lights.clusteringComputeBindGroup;

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();

        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.positionTextureView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.normalTextureView = this.normalTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm", // albedo
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.blitBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "store g-buffer bind group layout",
            entries: [
                {
                    // pos
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    // albedo
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    // nor
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
            ],
        });

        this.blitBindGroup = renderer.device.createBindGroup({
            label: "store g-buffer bind group",
            layout: this.blitBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView,
                },
                {
                    binding: 1,
                    resource: this.albedoTextureView,
                },
                {
                    binding: 2,
                    resource: this.normalTextureView,
                },
            ],
        });

        this.blitPipeline = renderer.device.createRenderPipeline({
            label: "store g-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "store g-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                entryPoint: "main",
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fragment shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    { format: "rgba16float" }, // position
                    { format: "rgba8unorm" }, // albedo
                    { format: "rgba16float" }, // normal
                ],
            },
        });

        this.pipeline = renderer.device.createRenderPipeline({
            label: "forward+ pipeline within clustered deferred",
            layout: renderer.device.createPipelineLayout({
                label: "forward+ pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.blitBindGroupLayout,
                ],
            }),
            vertex: {
                entryPoint: "main",
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                })
            },
            fragment: {
                entryPoint: "main",
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const canvasTextureView = renderer.context
            .getCurrentTexture()
            .createView();

        const blitRenderPass = encoder.beginRenderPass({
            label: "G-Buffer render pass",
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.albedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        blitRenderPass.setPipeline(this.blitPipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        blitRenderPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup,
        );

        this.scene.iterate(
            (node) => {
                blitRenderPass.setBindGroup(
                    shaders.constants.bindGroup_model,
                    node.modelBindGroup,
                );
            },
            (material) => {
                blitRenderPass.setBindGroup(
                    shaders.constants.bindGroup_material,
                    material.materialBindGroup,
                );
            },
            (primitive) => {
                blitRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
                blitRenderPass.setIndexBuffer(primitive.indexBuffer, "uint32");
                blitRenderPass.drawIndexed(primitive.numIndices);
            },
        );

        blitRenderPass.end();

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup,
        );

        // none of the constants match up so hard-code
        renderPass.setBindGroup(1, this.blitBindGroup);

        renderPass.draw(3);

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
