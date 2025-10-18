// TODO-2: implement the light clustering compute shader

@group(0) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(0) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(0) @binding(2) var<uniform> camUnifs: CameraUniforms;
@group(0) @binding(3) var<uniform> clusterUnifs: ClusterUniforms;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

// ss
fn toSS(x_idx: u32, y_idx: u32) -> vec2f {
    return vec2f(f32(x_idx * clusterUnifs.clusterSizeXY), f32(y_idx * clusterUnifs.clusterSizeXY));
}

// uv space
fn toUV(ss: vec2f) -> vec2f {
    let canvasSize = vec2f(f32(clusterUnifs.canvasSizeX), f32(clusterUnifs.canvasSizeY));

    return ss / canvasSize;
}

// ndc space
fn toNDC(uv: vec2f) -> vec2f {
    return 2.0 * uv - 1.0;
}

fn sphereIntersectsAABB(center: vec3f, radius: f32, bmin: vec3f, bmax: vec3f) -> bool {
    let closest = clamp(center, bmin, bmax);
    return length(center - closest) < radius;
}

@compute
@workgroup_size(${clusteringWorkgroupSize}, ${clusteringWorkgroupSize}, ${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= clusterUnifs.numClustersX || globalIdx.y >= clusterUnifs.numClustersY || globalIdx.z >= clusterUnifs.numClustersZ)
    {
        return;
    }

    let idx = (clusterUnifs.numClustersX * clusterUnifs.numClustersY * globalIdx.z) + (clusterUnifs.numClustersX * globalIdx.y) + globalIdx.x;

    let stepZ: f32 = pow(camUnifs.farClip / camUnifs.nearClip, 1.0 / f32(clusterUnifs.numClustersZ));

    // min and max xyz bounds for all relevant spaces
    let ssMin: vec2f = toSS(globalIdx.x, globalIdx.y);
    let uvMin: vec2f = toUV(ssMin);
    let ndcMin: vec2f = toNDC(uvMin);
    let vsZMin: f32 = camUnifs.nearClip * pow(stepZ, f32(globalIdx.z)); // view space z min

    let ssMax: vec2f = ssMin + f32(clusterUnifs.clusterSizeXY);
    let uvMax: vec2f = toUV(ssMax);
    let ndcMax: vec2f = toNDC(uvMax);
    let vsZMax = vsZMin * stepZ;
    
    // calculate the screenSpace XY at zMax using the slope components of the frustum 
    let max_xy_at_zMax: vec2f = vec2f(ndcMax.x * camUnifs.frustumSlopeX, ndcMax.y * camUnifs.frustumSlopeY) * vsZMax;
    let min_xy_at_zMax: vec2f = vec2f(ndcMin.x * camUnifs.frustumSlopeX, ndcMin.y * camUnifs.frustumSlopeY) * vsZMax;

    // create the bounding box, knowing that XY will be greater at ZMax as frustum widens
    let bboxMin: vec3f = vec3f(min_xy_at_zMax, -vsZMax);
    let bboxMax: vec3f = vec3f(max_xy_at_zMax, -vsZMin);

    var numLights: u32 = 0u;

    for (var i: u32 = 0u; i < lightSet.numLights; i++)
    {
        if (numLights >= ${maxClusterToLightRatio})
        { // only allocated |maxClusterToLightRatio| indices for each cluster
            break;
        }
        let currLight: Light = lightSet.lights[i];
        let vsLightPos: vec3f = (camUnifs.viewMat * vec4f(currLight.pos, 1.0)).xyz;

        if (sphereIntersectsAABB(vsLightPos, ${lightRadius}, bboxMin, bboxMax))
        {
            clusterSet.clusters[idx].lights[numLights] = i;
            numLights += 1u;
        }
    }
}
