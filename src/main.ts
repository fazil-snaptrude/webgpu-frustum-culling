/// <reference types="wesl-plugin/suffixes" />

import { link, LinkedWesl } from "wesl";
import mainWesl from "../shaders/main.wesl?link";
import GUI from "lil-gui";

import "./style.css";

main();

type Color = [number, number, number];
type GUIColor = {
  color: Color;
};

async function main(): Promise<void> {
  const gui = new GUI();
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!device) {
    return;
  }

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  const context = canvas?.getContext("webgpu");

  if (!context) {
    return;
  }

  context.configure({ device, format: "bgra8unorm" });

  const wesl = await link(mainWesl);

  const [setUniforms, bindGroup, renderPipeline] = setup(device, wesl);

  const topColor: GUIColor = { color: [1, 1, 1] };
  gui
    .addColor(topColor, "color")
    .onChange((newValue: Color) => setUniforms(newValue));

  const bottomColor: GUIColor = { color: [1, 1, 1] };
  gui
    .addColor(bottomColor, "color")
    .onChange((newValue: Color) => setUniforms(undefined, newValue));

  setUniforms(topColor.color, bottomColor.color);

  const rafCallback = () => {
    draw(device, context, bindGroup, renderPipeline);
    requestAnimationFrame(rafCallback);
  };

  requestAnimationFrame(rafCallback);
}

const setup = (
  device: GPUDevice,
  wesl: LinkedWesl
): [
  (
    topColor?: [number, number, number] | undefined,
    bottomColor?: [number, number, number] | undefined
  ) => void,
  GPUBindGroup,
  GPURenderPipeline
] => {
  const shaderModule = wesl.createShaderModule(device);

  const bindGroupLayout = device.createBindGroupLayout({
    label: "bindGroupLayout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const uniformBufferSize = 4 * 4 + 4 * 4; // Two vec4f
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const setUniforms = (
    topColor?: [number, number, number],
    bottomColor?: [number, number, number],
    alpha = 1
  ) => {
    if (topColor && bottomColor) {
      const uniformValue = new Float32Array([
        ...topColor,
        alpha,
        ...bottomColor,
        alpha,
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformValue);
    } else if (topColor) {
      const uniformValue = new Float32Array([...topColor, alpha]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformValue);
    } else if (bottomColor) {
      const uniformValue = new Float32Array([...bottomColor, alpha]);
      device.queue.writeBuffer(uniformBuffer, 16, uniformValue);
    }
  };

  const bindGroup = device.createBindGroup({
    label: "bindGroup",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  const renderPipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: "vs_main",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format: "bgra8unorm",
        },
      ],
    },
  });

  return [setUniforms, bindGroup, renderPipeline];
};

const draw = (
  device: GPUDevice,
  context: GPUCanvasContext,
  bindGroup: GPUBindGroup,
  renderPipeline: GPURenderPipeline
): void => {
  const encoder = device.createCommandEncoder();
  const texture = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    label: "renderPass",
    colorAttachments: [
      {
        view: texture,
        storeOp: "store",
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
      },
    ],
  });
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setPipeline(renderPipeline);
  renderPass.draw(3, 1);
  renderPass.end();
  device.queue.submit([encoder.finish()]);
};
