import Stats from "stats.js";
import { GUI } from "dat.gui";

import { initWebGPU, Renderer, getMinClusterSize } from "./renderer";
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

let camera = new Camera();
let lights = new Lights(camera);

let minClusterSize = Camera.clusterSize; // min cluster size

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

let stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

// TODO: memory leaks
async function reset() {
    console.log("resetting...");
    await initWebGPU();

    scene = new Scene();
    await scene.loadGltf("./scenes/sponza/Sponza.gltf");

    camera = new Camera();
    lights = new Lights(camera);

    stage = new Stage(scene, lights, camera, stats);
}

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
        renderer?.stop();
    } else {
        setRenderer(renderModeController.getValue());
    }

    paused = val;
}

gui.add({ paused: paused }, "paused").onChange(toggleRenderer);

toggleRenderer(paused);

// faux far plane gui slider (user-facing term, no amy brain)
gui.add({ searchCutoff: Camera.fauxFarPlane }, "searchCutoff", 5, 500).onChange(
    camera.updateFauxFarPlane,
);

let clusterSizeController = gui.add(
    { clusterSize: Camera.clusterSize },
    "clusterSize",
    minClusterSize,
    256,
);

// cluster size gui slider
async function changeClusterSize(val: number, resized: boolean = false) {
    renderer?.stop();

    if (resized) {
        minClusterSize = getMinClusterSize();

        Camera.updateClusterSize(minClusterSize); // update global cluster size

        clusterSizeController.min(minClusterSize);
        clusterSizeController.setValue(minClusterSize); // set gui vars

        await reset(); // reset now that static Cam values have been updated
    } else {
        Camera.updateClusterSize(val); // update global cluster size
    }

    setRenderer(renderModeController.getValue()); // create new renderer with updated cluster size so that buffer sizes are reset
}

clusterSizeController.onFinishChange(changeClusterSize);

window.addEventListener("resize", () =>
    changeClusterSize(Camera.clusterSize, true),
); // listen for window resizing

changeClusterSize(Camera.clusterSize, true);
