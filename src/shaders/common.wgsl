// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct Cluster {
    numLights: u32,
    lights: array<u32, ${maxClusterToLightRatio}>
}

struct ClusterSet {
    numClusters: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    nearClip: f32,
    searchCutoff: f32,
    frustumSlopeX: f32,
    frustumSlopeY: f32,
    exposureOffset: f32
}

// all u32 (no 16-bit in wgsl)
struct ClusterUniforms {
    numClustersX: u32,
    numClustersY: u32,
    numClustersZ: u32,
    clusterSizeXY: u32,
    canvasSizeX: u32,
    canvasSizeY: u32,
    lightSearchRadius: u32
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32, lightSearchRadius: f32) -> f32 {
    return clamp(1.f - pow(distance / lightSearchRadius, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f, lightSearchRadius: u32) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight, f32(lightSearchRadius));
}
