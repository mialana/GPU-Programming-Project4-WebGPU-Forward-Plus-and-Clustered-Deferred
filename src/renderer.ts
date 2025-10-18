import { Scene } from "./stage/scene";
import { Lights } from "./stage/lights";
import { Camera } from "./stage/camera";
import { Stage } from "./stage/stage";

export var canvas: HTMLCanvasElement;
export var canvasFormat: GPUTextureFormat;
export var context: GPUCanvasContext;
export var device: GPUDevice;
export var canvasTextureView: GPUTextureView;

export var aspectRatio: number;
export const fovYDegrees = 45;

export var modelBindGroupLayout: GPUBindGroupLayout;
export var materialBindGroupLayout: GPUBindGroupLayout;

import { divUp } from "./math_util";

export interface ClusterParams {
    numX: number; // num clusters in X
    numY: number; // num clusters in Y
    numZ: number; // num clusters in Z
    clusterSize: number;
    canvasSizeX: number;
    canvasSizeY: number;
}

// mobile first development? idek should never be used anyhow
export const defaultClusterParams: ClusterParams = {
    numX: 16, numY: 16, numZ: 16, clusterSize: 32, canvasSizeX: 800, canvasSizeY: 600
}

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    aspectRatio = canvas.width / canvas.height;

    if (!navigator.gpu) {
        let errorMessageElement = document.createElement("h1");
        errorMessageElement.textContent =
            "This browser doesn't support WebGPU! Try using Google Chrome.";
        errorMessageElement.style.paddingLeft = "0.4em";
        document.body.innerHTML = "";
        document.body.appendChild(errorMessageElement);
        throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("no appropriate GPUAdapter found");
    }

    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu")!;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    console.log("WebGPU init successsful");

    modelBindGroupLayout = device.createBindGroupLayout({
        label: "model bind group layout",
        entries: [
            {
                // modelMat
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" },
            },
        ],
    });

    materialBindGroupLayout = device.createBindGroupLayout({
        label: "material bind group layout",
        entries: [
            {
                // diffuseTex
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            },
            {
                // diffuseTexSampler
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            },
        ],
    });
}

export function getMinClusterSize() {
    if (!canvas) {
        initWebGPU();
    }

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    const area = canvas.width * canvas.height;

    if (area < 800 * 600) return 16; // mobile? screen
    if (area < 1920 * 1080) return 32; // HD
    if (area < 2560 * 1440) return 64; // monitor
    return 128;
}

export function getClusterParams(
    clusterSize: number,
): ClusterParams {
    if (!canvas) {
        initWebGPU();
    }

    // trick to only have one global clusterSize
    // user doesn't have to know shhh
    const numClustersZ = Math.max(
        8,
        Math.round(28 * Math.pow(32 / clusterSize, 0.5)),
    );

    return {
        numX: divUp(canvas.width, clusterSize),
        numY: divUp(canvas.height, clusterSize),
        numZ: numClustersZ,
        clusterSize: clusterSize,
        canvasSizeX: canvas.width,
        canvasSizeY: canvas.height
    };
}

export const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        {
            // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0,
        },
        {
            // nor
            format: "float32x3",
            offset: 12,
            shaderLocation: 1,
        },
        {
            // uv
            format: "float32x2",
            offset: 24,
            shaderLocation: 2,
        },
    ],
};

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        this.draw();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
