import Stats from "stats.js";
import { GUI } from "dat.gui";

import { initWebGPU, Renderer } from "./renderer";
import { NaiveRenderer } from "./renderers/naive";
import { ForwardPlusRenderer } from "./renderers/forward_plus";
import { ClusteredDeferredRenderer } from "./renderers/clustered_deferred";

import { setupLoaders, Scene } from "./stage/scene";
import { Lights } from "./stage/lights";
import { Camera } from "./stage/camera";
import { Stage } from "./stage/stage";

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf("./scenes/sponza/Sponza.gltf");

let paused = false;

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(lights, "numLights")
    .min(1)
    .max(Lights.maxNumLights)
    .step(1)
    .onChange(() => {
        lights.updateLightSetUniformNumLights();
    });

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            ``;
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
    }
}

const renderModes = {
    naive: "naive",
    forwardPlus: "forward+",
    clusteredDeferred: "clustered deferred",
};
let renderModeController = gui.add(
    { mode: renderModes.forwardPlus },
    "mode",
    renderModes,
);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());

/* to pause during development */
function toggleRenderer(val: boolean) {
    if (val) {
        setRenderer(renderModeController.getValue());
    } else {
        renderer?.stop();
    }

    paused = val;
}

gui.add({ paused: paused }, "paused").onChange(toggleRenderer);

// far plane gui slider
gui.add({ farPlane: Camera.farPlane }, "farPlane", 100, 5000).onFinishChange(
    camera.updateNearFar,
);

// cluster size gui slider
function changeClusterSize(val: number)
{
    renderer?.stop();

    Camera.updateClusterSize(val); // update global cluster size
    setRenderer(renderModeController.getValue()); // create new renderer with updated cluster size so that buffer sizes are reset
}

gui.add({ clusterSize: Camera.clusterSize }, "clusterSize", 8, 64).onFinishChange(changeClusterSize);