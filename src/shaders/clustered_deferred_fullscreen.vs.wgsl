// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexInput
{
    @builtin(vertex_index) vertIdx: u32
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f
}

@vertex
fn main(in: VertexInput) -> VertexOutput {
    // positions for fullscreen vertices
    let idxPositions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f(3.0, -1.0),
        vec2f(-1.0, 3.0)
    );

    var out: VertexOutput;
    out.fragPos = vec4f(idxPositions[in.vertIdx], 0.0, 1.0);

    return out;
}