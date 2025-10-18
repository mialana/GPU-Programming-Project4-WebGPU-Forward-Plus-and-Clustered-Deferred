import { Mat4, mat4, Vec3, vec3, Vec2, vec2 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import {
    device,
    canvas,
    fovYDegrees,
    aspectRatio,
    getClusterParams,
    ClusterParams,
    defaultClusterParams,
} from "../renderer";

class CameraUniforms {
    readonly floatPadding = 3;
    readonly floatBuffer = new ArrayBuffer((16 + 16 + 2 + 1 + 1 + 1 + this.floatPadding) * 4);
    private readonly floatView = new Float32Array(this.floatBuffer);

    // all i32 (no 16-bit in wgsl)
    readonly intPadding = 1;
    readonly intBuffer = new ArrayBuffer((7 + this.intPadding) * 4);
    readonly intView = new Int32Array(this.intBuffer);

    set viewProjMat(mat: Float32Array) {
        // TODO-1.1: set the first 16 elements of `this.floatView` to the input `mat`
        for (var i = 0; i < 16; i++) {
            this.floatView[i] = mat[i];
        }
    }

    // TODO-2: add extra functions to set values needed for light clustering here

    set viewMat(mat: Float32Array) {
        for (let i = 0; i < 16; i++) {
            this.floatView[16 + i] = mat[i];
        }
    }

    set nearFar(nearFar: Vec2) {
        this.floatView[32] = nearFar[0];
        this.floatView[33] = nearFar[1];
    }

    set frustumSlopeX(slopeX: number) {
        this.floatView[34] = slopeX;
    }

    set frustumSlopeY(slopeY: number) {
        this.floatView[35] = slopeY;
    }

    set exposureOffset(exposureOffset: number)
    {
        this.floatView[36] = exposureOffset;
    }

    // params that are needed on the device
    set dev_clusterParams(params: ClusterParams) {
        this.intView[0] = params.numX; // numX
        this.intView[1] = params.numY; // numY
        this.intView[2] = params.numZ; // numY
        this.intView[3] = params.clusterSize; // clusterSize
        this.intView[4] = params.canvasSizeX; // currCanvasX
        this.intView[5] = params.canvasSizeY; // currCanvasY
        this.intView[6] = Camera.lightSearchRadius;
    }
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsBuffer: GPUBuffer;

    projMat: Mat4 = mat4.create();

    cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.004;
    sensitivity: number = 0.15;

    static exposureOffset = 0.0;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 1000;

    static fauxFarPlane = 15; // fake far plane for relevant light searching

    clusterUniformsBuffer: GPUBuffer;

    static clusterSize = 32; // in case i want to expose this later (DONE)
    static clusterParams: ClusterParams = defaultClusterParams;

    static lightSearchRadius = 2; 

    keys: { [key: string]: boolean } = {};

    constructor() {
        // TODO-1.1: set `this.uniformsBuffer` to a new buffer of size `this.uniforms.buffer.byteLength`
        // ensure the usage is set to `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` since we will be copying to this buffer
        // check `lights.ts` for examples of using `device.createBuffer()`
        //
        // note that you can add more variables (e.g. inverse proj matrix) to this buffer in later parts of the assignment
        this.uniformsBuffer = device.createBuffer({
            size: this.uniforms.floatBuffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.clusterUniformsBuffer = device.createBuffer({
            size: this.uniforms.intBuffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.projMat = mat4.perspective(
            toRadians(fovYDegrees),
            aspectRatio,
            Camera.nearPlane,
            Camera.farPlane,
        );

        Camera.updateClusterSize(Camera.clusterSize);

        this.rotateCamera(0, 0); // set initial camera vectors

        window.addEventListener("keydown", (event) =>
            this.onKeyEvent(event, true),
        );
        window.addEventListener("keyup", (event) =>
            this.onKeyEvent(event, false),
        );
        window.onblur = () => (this.keys = {}); // reset keys on page exit so they don't get stuck (e.g. on alt + tab)

        canvas.addEventListener("mousedown", () => canvas.requestPointerLock());
        canvas.addEventListener("mouseup", () => document.exitPointerLock());
        canvas.addEventListener("mousemove", (event) =>
            this.onMouseMove(event),
        );
    }

    public static updateClusterSize(clusterSize: number) {
        Camera.clusterSize = clusterSize;
        Camera.clusterParams = getClusterParams(clusterSize);

        console.log(Camera.clusterParams);
    }

    public static updateExposureOffset(exposureOffset: number) {
        Camera.exposureOffset = exposureOffset;

        console.log(Camera.exposureOffset);
    }

    public static updateLightRadius(lightRadius: number) {
        Camera.lightSearchRadius = lightRadius;

        console.log(Camera.lightSearchRadius);
    }

    public updateFauxFarPlane(fakie: number) {
        Camera.fauxFarPlane = fakie; // muahaha
    }

    private onKeyEvent(event: KeyboardEvent, down: boolean) {
        this.keys[event.key.toLowerCase()] = down;
        if (this.keys["alt"]) {
            // prevent issues from alt shortcuts
            event.preventDefault();
        }
    }

    private rotateCamera(dx: number, dy: number) {
        this.yaw += dx;
        this.pitch -= dy;

        if (this.pitch > 89) {
            this.pitch = 89;
        }
        if (this.pitch < -89) {
            this.pitch = -89;
        }

        const front = mat4.create();
        front[0] =
            Math.cos(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));
        front[1] = Math.sin(toRadians(this.pitch));
        front[2] =
            Math.sin(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));

        this.cameraFront = vec3.normalize(front);
        this.cameraRight = vec3.normalize(
            vec3.cross(this.cameraFront, [0, 1, 0]),
        );
        this.cameraUp = vec3.normalize(
            vec3.cross(this.cameraRight, this.cameraFront),
        );
    }

    private onMouseMove(event: MouseEvent) {
        if (document.pointerLockElement === canvas) {
            this.rotateCamera(
                event.movementX * this.sensitivity,
                event.movementY * this.sensitivity,
            );
        }
    }

    private processInput(deltaTime: number) {
        let moveDir = vec3.create(0, 0, 0);
        if (this.keys["w"]) {
            moveDir = vec3.add(moveDir, this.cameraFront);
        }
        if (this.keys["s"]) {
            moveDir = vec3.sub(moveDir, this.cameraFront);
        }
        if (this.keys["a"]) {
            moveDir = vec3.sub(moveDir, this.cameraRight);
        }
        if (this.keys["d"]) {
            moveDir = vec3.add(moveDir, this.cameraRight);
        }
        if (this.keys["q"]) {
            moveDir = vec3.sub(moveDir, this.cameraUp);
        }
        if (this.keys["e"]) {
            moveDir = vec3.add(moveDir, this.cameraUp);
        }

        let moveSpeed = this.moveSpeed * deltaTime;
        const moveSpeedMultiplier = 3;
        if (this.keys["shift"]) {
            moveSpeed *= moveSpeedMultiplier;
        }
        if (this.keys["alt"]) {
            moveSpeed /= moveSpeedMultiplier;
        }

        if (vec3.length(moveDir) > 0) {
            const moveAmount = vec3.scale(vec3.normalize(moveDir), moveSpeed);
            this.cameraPos = vec3.add(this.cameraPos, moveAmount);
        }
    }

    onFrame(deltaTime: number) {
        this.processInput(deltaTime);

        const lookPos = vec3.add(
            this.cameraPos,
            vec3.scale(this.cameraFront, 1),
        );
        const viewMat = mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]);
        const viewProjMat = mat4.mul(this.projMat, viewMat);

        // TODO-1.1: set `this.uniforms.viewProjMat` to the newly calculated view proj mat
        this.uniforms.viewProjMat = viewProjMat;

        // TODO-2: write to extra buffers needed for light clustering here
        this.uniforms.viewMat = viewMat;

        this.uniforms.nearFar = vec2.create(
            Camera.nearPlane,
            Camera.fauxFarPlane,
        );

        this.uniforms.exposureOffset = Camera.exposureOffset;

        const slopeY = Math.tan(0.5 * toRadians(fovYDegrees));
        this.uniforms.frustumSlopeY = slopeY;
        this.uniforms.frustumSlopeX = aspectRatio * slopeY;

        this.uniforms.dev_clusterParams = Camera.clusterParams;

        // TODO-1.1: upload `this.uniforms.buffer` (host side) to `this.uniformsBuffer` (device side)
        // check `lights.ts` for examples of using `device.queue.writeBuffer()`
        device.queue.writeBuffer(
            this.uniformsBuffer,
            0,
            this.uniforms.floatBuffer,
        );

        device.queue.writeBuffer(
            this.clusterUniformsBuffer,
            0,
            this.uniforms.intBuffer,
        );
    }
}
