import { linkBuildExtension } from "wesl-plugin";
import viteWesl from "wesl-plugin/vite";

export default {
  base: process.env.CI ? "/webgpu-frustum-culling/" : "/",
  plugins: [viteWesl({ extensions: [linkBuildExtension] })],
};
