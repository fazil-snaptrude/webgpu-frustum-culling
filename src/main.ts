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

  let start = performance.now();
  let framesThisSecond = 0;
  let averageDrawTime = 0;
  const drawCountObj = { drawCount: 100 };
  gui
    .add(drawCountObj, "drawCount")
    .min(0)
    .max(1_000_000)
    .step(1)
    .onChange(() => {
      start = performance.now();
      framesThisSecond = 0;
      averageDrawTime = 0;
    });

  const rafCallback = () => {
    if (performance.now() - start >= 1000) {
      console.log(
        `Last second average draw time for ${
          drawCountObj.drawCount
        } draw calls: ${averageDrawTime.toFixed(4)} ms, ${(
          averageDrawTime / drawCountObj.drawCount
        ).toFixed(4)} ms per draw call`
      );
      start = performance.now();
      framesThisSecond = 0;
    }

    const drawTime = draw(
      device,
      context,
      bindGroup,
      renderPipeline,
      drawCountObj.drawCount
    );
    framesThisSecond += 1;
    averageDrawTime = (averageDrawTime + drawTime) / framesThisSecond;

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
  renderPipeline: GPURenderPipeline,
  drawCount: number
): number => {
  const timeBeginning = performance.now();

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

  for (let i = 0; i < drawCount; i++) {
    renderPass.draw(3, 1);
  }

  renderPass.end();
  device.queue.submit([encoder.finish()]);

  return performance.now() - timeBeginning;
};
