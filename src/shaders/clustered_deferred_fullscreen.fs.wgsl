// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnifs: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterUnifs: ClusterUniforms;

@group(1) @binding(0) var posBuf: texture_2d<f32>;
@group(1) @binding(1) var albedoBuf: texture_2d<f32>;
@group(1) @binding(2) var norBuf: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let uv01 = vec2f(in.fragPos.x / f32(clusterUnifs.canvasSizeX), in.fragPos.y / f32(clusterUnifs.canvasSizeY));
    let uv = vec2i(i32(in.fragPos.x), i32(in.fragPos.y)); // only fullscreen fragment

    // textureLoad(t: texture_2d<ST>, coords: vec2<C>, level: L) -> vec4<ST>
    // can't use textureSample for our G-buffer
    let pos: vec3f = textureLoad(posBuf, uv, 0).xyz;
    let albedo: vec3f = textureLoad(albedoBuf, uv, 0).xyz;
    let nor: vec3f = textureLoad(norBuf, uv, 0).xyz;

    let xy_clusterIdx: vec2u = vec2u(in.fragPos.xy / vec2f(f32(clusterUnifs.clusterSizeXY), f32(clusterUnifs.clusterSizeXY)));

    // can't use searchCutoff in camUnif as it is the scaled far for clusters
    let viewSpace_pos: vec3f = (camUnifs.viewMat * vec4f(pos, 1.0)).xyz;
    let viewSpace_z: f32 = -viewSpace_pos.z;

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
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1);
}
