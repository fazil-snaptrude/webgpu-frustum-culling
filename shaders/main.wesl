struct Uniforms {
    topColor: vec4<f32>,
    bottomColor: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @builtin(vertex_index) vertex_index: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) y: f32
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    let x = f32(i32(in.vertex_index) - 1);
    let y = f32(i32(in.vertex_index & 1u) * 2 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.y = out.position.y;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    return mix(uniforms.bottomColor, uniforms.topColor, in.y);
}