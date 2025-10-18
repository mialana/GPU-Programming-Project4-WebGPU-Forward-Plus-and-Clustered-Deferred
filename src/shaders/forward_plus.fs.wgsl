// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnifs: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterUnifs: ClusterUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

// http://www.jcgt.org/published/0009/03/02/
fn pcg3d(p: vec3u) -> vec3u {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
    return v;
}

fn pcg3d_to_float01(p: vec3u) -> vec3f {
    let hashed = pcg3d(p);
    return vec3f(hashed) / 4294967295.0; // 2^32 - 1
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let xy_clusterIdx: vec2u = vec2u(in.fragPos.xy / vec2f(f32(clusterUnifs.clusterSizeXY), f32(clusterUnifs.clusterSizeXY)));

    // can't use searchCutoff in camUnif as it is the scaled far for clusters
    let viewSpace_pos: vec3f = (camUnifs.viewMat * vec4f(in.pos, 1.0)).xyz;
    let viewSpace_z: f32 = -viewSpace_pos.z;

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    if (viewSpace_z < camUnifs.nearClip || viewSpace_z > camUnifs.searchCutoff) 
    {
        // skip lighting
        return vec4f(0.0);
    }

    // TODO: is this wasteful?
    let stepZ: f32 = pow(camUnifs.searchCutoff / camUnifs.nearClip, 1.0 / f32(clusterUnifs.numClustersZ));
    let z_clusterSpace: f32 = log(viewSpace_z / camUnifs.nearClip) / log(stepZ);
    let z_clusterIdx: u32 = u32(clamp(floor(z_clusterSpace), 0.0, f32(clusterUnifs.numClustersZ - 1u)));

    let clusterIdx_3d = vec3u(xy_clusterIdx.x, xy_clusterIdx.y, z_clusterIdx);
    let clusterIdx_1d: u32 = (clusterUnifs.numClustersX * clusterUnifs.numClustersY * z_clusterIdx) + (clusterUnifs.numClustersX * xy_clusterIdx.y) + xy_clusterIdx.x;

    let cluster: Cluster = clusterSet.clusters[clusterIdx_1d];
    let clusterNumLights: u32 = cluster.numLights;
    let clusterLights: array<u32, ${maxClusterToLightRatio}> = cluster.lights;

    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < clusterNumLights; i++) {
        let light: Light = lightSet.lights[clusterLights[i]];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    // for debugging purposes
    // let clusterColor = vec3f(pcg3d_to_float01(clusterIdx_3d));
    // return vec4(clusterColor.xyz, 1);

    // let tmp = f32(clusterNumLights) / 256.0;

    // return vec4(tmp, tmp, tmp, 1);

    // return vec4(f32(clusterNumLights), f32(clusterNumLights), f32(clusterNumLights), 1);
    
    // return vec4(diffuseColor.rgb, 1);
    // return vec4(in.fragPos.xyz, 1);

    // return vec4((-viewSpace_pos.zzz) / camUnifs.searchCutoff, 1);

    // return vec4(in.fragPos.x / f32(clusterUnifs.canvasSizeX), in.fragPos.y / f32(clusterUnifs.canvasSizeY), in.fragPos.z / 1000.0, 1.0);
}
