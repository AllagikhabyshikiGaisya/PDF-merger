//Enhanced development server with hot reload capabilities

const { spawn } = require("child_process");
const chokidar = require("chokidar");
const path = require("path");

let electronProcess = null;

function startElectron() {
  if (electronProcess) {
    console.log("Restarting Electron...");
    electronProcess.kill();
  }

  console.log("Starting Electron...");

  electronProcess = spawn("electron", ["."], {
    stdio: "inherit",
    shell: true,
  });

  electronProcess.on("close", (code) => {
    if (code !== null) {
      console.log(`Electron process exited with code ${code}`);
      electronProcess = null;
    }
  });
}

//Watching the main process files
const mainWatcher = chokidar.watch(["main.js", "preload.js"], {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100,
  },
});

mainWatcher.on("change", (filePath) => {
  console.log(`\nFile changed:${path.basename(filePath)}`);
  startElectron();
});

//Wathc renderer process files
const rendererWatcher = chokidar.watch(
  ["renderer.js", "style.css", "index.html"],
  {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  }
);

rendererWatcher.on("change", (filePath) => {
  console.log(`\nRenderer file changed: ${path.basename(filePath)}`);
  if (electronProcess) {
    electronProcess.stdin.write("reload\n");
  }
});

console.log("🚀 Development server started");
console.log("👀 Watching for changes...");
console.log("   - Main: main.js, preload.js");
console.log("   - Renderer: renderer.js, style.css, index.html");
console.log("\nPress Ctrl+C to stop\n");

startElectron();

process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down...");
  if (electronProcess) {
    electronProcess.kill();
  }
  mainWatcher.close();
  rendererWatcher.close();
  process.exit(0);
});
