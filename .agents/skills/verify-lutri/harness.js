// Drive an isolated Lutri dev instance. See SKILL.md for when to run each command.
//
//   node .agents/skills/verify-lutri/harness.js launch
//   node .agents/skills/verify-lutri/harness.js doctor
//   node .agents/skills/verify-lutri/harness.js state [--heading Settings] [--palette sand] [--category providers] [--provider "Black Forest Labs"] [--path evidence/state.json]
//   node .agents/skills/verify-lutri/harness.js click --role button --name Settings
//   node .agents/skills/verify-lutri/harness.js fill --role textbox --name Prompt --value "text"
//   node .agents/skills/verify-lutri/harness.js text --role textbox --name Prompt --equals "text"
//   node .agents/skills/verify-lutri/harness.js snapshot --path evidence/feature/view.aria.txt [--contains "text"]...
//   node .agents/skills/verify-lutri/harness.js screenshot --path evidence/feature/view.png
//   node .agents/skills/verify-lutri/harness.js read-record --collection preferences --id preferences --field palette --equals neutral --path evidence/feature/preferences.json
//   node .agents/skills/verify-lutri/harness.js run --path recipe.txt
//   node .agents/skills/verify-lutri/harness.js cleanup

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const DEBUG_PORT = 9333;
const DEV_PORT = 14720;
const IDENTIFIER = "app.lutri.studio.verify";
const PRODUCT_NAME = "Lutri Verify";
const LAUNCH_TIMEOUT_MS = 20 * 60 * 1000;

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(skillDir, "../../..");
const configPath = path.join(skillDir, "verify.config.json");
const scratch = path.join(process.env.LOCALAPPDATA ?? "", "LutriVerify");
const targetDir = path.join(scratch, "target");
const webviewDir = path.join(scratch, "webview");
const runPath = path.join(scratch, "run.json");
const logPath = path.join(scratch, "dev.log");
const dataDir = path.join(process.env.APPDATA ?? "", IDENTIFIER);
const realDataDir = path.join(process.env.APPDATA ?? "", "app.lutri.studio");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  const error = new Error(message);
  error.failure = true;
  throw error;
}

function option(argv, name) {
  const index = argv.findIndex((arg) => arg === name || arg.startsWith(name + "="));
  if (index === -1) return undefined;
  if (argv[index] !== name) return argv[index].slice(name.length + 1);
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) fail(`Missing value for ${name}`);
  return value;
}

function options(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail(`Missing value for ${name}`);
      values.push(value);
      index += 1;
    } else if (arg.startsWith(name + "=")) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return values;
}

function requireOption(argv, name) {
  return option(argv, name) ?? fail(`Missing ${name}`);
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function assertWindows() {
  if (process.platform !== "win32" || !process.env.APPDATA || !process.env.LOCALAPPDATA)
    fail("This harness requires Windows with APPDATA and LOCALAPPDATA.");
}

function assertVerifyConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.identifier !== IDENTIFIER || config.productName !== PRODUCT_NAME)
    fail(`Refusing to launch ${configPath}: identifier and productName must stay ${IDENTIFIER} / ${PRODUCT_NAME}.`);
  if (config.build?.devUrl !== `http://localhost:${DEV_PORT}`)
    fail(`Refusing to launch ${configPath}: devUrl must be http://localhost:${DEV_PORT}.`);
  if (samePath(dataDir, realDataDir)) fail("Verify data directory resolved to the real Lutri profile.");
}

function removeExactDir(dir, expected) {
  if (!samePath(dir, expected)) fail(`Refusing to delete ${dir}`);
  if (path.basename(path.resolve(dir)).toLowerCase() === "app.lutri.studio")
    fail("Refusing to delete the real Lutri profile.");
  if (!fs.existsSync(dir)) return;
  if (fs.lstatSync(dir).isSymbolicLink()) fail(`Refusing to delete symlink ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

function readRun() {
  if (!fs.existsSync(runPath)) return undefined;
  return JSON.parse(fs.readFileSync(runPath, "utf8"));
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processControl(action, run) {
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", path.join(skillDir, "processes.ps1"),
    "-Action", action, "-NodeExe", process.execPath, "-ConfigPath", configPath, "-AppExe", expectedExe(),
    "-DevPort", String(DEV_PORT), "-DebugPort", String(DEBUG_PORT),
  ];
  if (action !== "idle") {
    if (!run || run.identifier !== IDENTIFIER || run.productName !== PRODUCT_NAME ||
        !samePath(run.configPath, configPath) || !samePath(run.dataDir, dataDir) ||
        !Number.isInteger(run.pid) || run.pid <= 0) fail("No matching verify run for this checkout.");
    args.push("-LauncherPid", String(run.pid));
    if (action !== "identify") {
      if (!/^\d+$/.test(run.startedAt)) fail("The verify run has no launcher creation time.");
      args.push("-StartedAt", run.startedAt);
    }
  }
  return execFileSync("powershell.exe", args, { encoding: "utf8", windowsHide: true }).trim();
}

async function portOpen(port) {
  const open = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      const done = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    });
  return (await open("127.0.0.1")) || (await open("::1"));
}

function logTail() {
  if (!fs.existsSync(logPath)) return "";
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
  return lines.slice(-40).join("\n");
}

async function devPage() {
  let payload;
  try {
    payload = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, { redirect: "error" }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  } catch {
    return undefined;
  }
  const targets = payload.filter((target) => target.type === "page" &&
    [`http://localhost:${DEV_PORT}/`, `http://127.0.0.1:${DEV_PORT}/`].includes(target.url));
  if (!targets.length) return undefined;
  if (targets.length !== 1) fail("Multiple Lutri verify windows found.");
  const [page] = targets;
  const endpoint = new URL(page.webSocketDebuggerUrl);
  if (![`ws://127.0.0.1:${DEBUG_PORT}`, `ws://localhost:${DEBUG_PORT}`].includes(endpoint.origin) ||
      endpoint.pathname !== `/devtools/page/${page.id}` || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    fail("Unexpected debugger endpoint for the verify window.");
  return page;
}

function cdpSend(ws, pending) {
  let next = 0;
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

// While a recipe runs, the process-tree check from `run` covers every step.
let insideRecipe = false;

async function withPage(fn, { run = readRun(), launching = false } = {}) {
  if (!insideRecipe) processControl("check", run);
  const page = await devPage();
  if (launching && !page) return undefined;
  if (!page?.webSocketDebuggerUrl) fail(`No Lutri page on http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP socket timed out")), 10000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP socket failed"));
    });
  });
  const send = cdpSend(ws, pending);
  try {
    return await fn(send);
  } finally {
    ws.close();
  }
}

const probeExpression = `(() => {
  const credential = document.querySelector(".creation-credential");
  const alert = document.querySelector('[role="alert"]');
  const activeCategory = document.querySelector('.settings-navigation [aria-current="page"]');
  const providerPanel = document.querySelector('#settings-panel-providers:not([hidden])');
  return {
    title: document.title,
    url: location.href,
    lang: document.documentElement.lang,
    heading: document.querySelector("h1")?.textContent ?? "",
    palette: document.documentElement.dataset.palette ?? "",
    accent: document.documentElement.dataset.accent ?? "",
    settingsCategory: activeCategory?.id.replace("settings-nav-", "") ?? "",
    openProviders: Array.from(providerPanel?.querySelectorAll("details[open] > summary strong") ?? [], el => el.textContent.trim()),
    credentialStatus: credential?.querySelector("span")?.textContent.trim() ?? "",
    credential: (credential ? (credential.innerText || credential.textContent) : "").replace(/\\s+/g, " ").trim(),
    alert: (alert?.innerText ?? "").replace(/\\s+/g, " ").trim()
  };
})()`;

async function probe(send) {
  const result = await send("Runtime.evaluate", { expression: probeExpression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function uiReady(value) {
  return Boolean(value?.heading && !value.alert && value.credentialStatus && value.credentialStatus !== "…");
}

async function axNodes(send) {
  await send("Accessibility.enable");
  const tree = await send("Accessibility.getFullAXTree");
  return tree.nodes.filter((node) => !node.ignored && node.role?.value && node.name?.value);
}

function nodeName(node) {
  return String(node.name?.value ?? "").replace(/\s+/g, " ").trim();
}

function axFlags(node) {
  const flags = [];
  for (const key of ["pressed", "current"]) {
    const property = node.properties?.find((entry) => entry.name === key);
    if (property?.value?.value !== undefined) flags.push(`${key}=${property.value.value}`);
  }
  return flags.length ? ` ${flags.join(" ")}` : "";
}

async function findNode(send, role, name) {
  const matches = (await axNodes(send)).filter((node) => node.role.value === role && nodeName(node) === name);
  if (matches.length !== 1) {
    const seen = (await axNodes(send))
      .filter((node) => node.role.value === role)
      .map(nodeName)
      .slice(0, 50);
    fail(
      matches.length === 0
        ? `No ${role} named ${JSON.stringify(name)}. Seen: ${seen.join(" | ")}`
        : `Found ${matches.length} ${role} nodes named ${JSON.stringify(name)}`,
    );
  }
  return matches[0];
}

async function nodeText(send, node) {
  const resolved = await send("DOM.resolveNode", { backendNodeId: node.backendDOMNodeId });
  const result = await send("Runtime.callFunctionOn", {
    objectId: resolved.object.objectId,
    functionDeclaration: `function() {
      this.scrollIntoView({ block: "center", inline: "center" });
      if (this.isContentEditable) return this.innerText;
      if ("value" in this && typeof this.value === "string") return this.value;
      return this.innerText ?? this.textContent ?? "";
    }`,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return String(result.result.value ?? "");
}

async function clickNode(send, node) {
  await nodeText(send, node);
  const model = await send("DOM.getBoxModel", { backendNodeId: node.backendDOMNodeId });
  const quad = model.model.content;
  const x = (quad[0] + quad[2]) / 2;
  const y = (quad[1] + quad[5]) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail("Element has no clickable box");
  await send("Page.bringToFront");
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
}

async function launch() {
  assertWindows();
  assertVerifyConfig();
  const tauri = path.join(repo, "node_modules", "@tauri-apps", "cli", "tauri.js");
  if (!fs.existsSync(tauri)) fail(`Missing ${tauri}. Run npm ci in ${repo} before launch.`);
  const existing = readRun();
  if (existing && alive(existing.pid)) fail(`A verify instance is already running as pid ${existing.pid}. Run cleanup before launching another.`);
  processControl("idle");
  removeExactDir(dataDir, dataDir);
  removeExactDir(webviewDir, webviewDir);
  fs.mkdirSync(webviewDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(scratch, { recursive: true });
  const logFd = fs.openSync(logPath, "w");
  const child = spawn(process.execPath, [tauri, "dev", "--config", configPath], {
    cwd: repo,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      CARGO_TARGET_DIR: targetDir,
      WEBVIEW2_USER_DATA_FOLDER: webviewDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT} --remote-allow-origins=http://127.0.0.1:${DEBUG_PORT}`,
    },
  });
  fs.closeSync(logFd);
  await new Promise((resolve, reject) => child.once("spawn", resolve).once("error", reject));
  const run = {
    pid: child.pid,
    debugPort: DEBUG_PORT,
    devUrl: `http://localhost:${DEV_PORT}/`,
    dataDir,
    webviewDir,
    targetDir,
    logPath,
    configPath,
    identifier: IDENTIFIER,
    productName: PRODUCT_NAME,
    repo,
    version: JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version,
  };
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  let pinned = false;
  try {
    run.startedAt = processControl("identify", run);
    fs.writeFileSync(runPath + ".tmp", JSON.stringify(run, null, 2));
    fs.renameSync(runPath + ".tmp", runPath);
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) fail(`Lutri Verify exited before the UI was ready.\n${logTail()}`);
      if ((await portOpen(DEBUG_PORT)) && (await portOpen(DEV_PORT))) {
        const value = await withPage(async (send) => {
          try {
            return await probe(send);
          } catch (error) {
            // Reloading the page can temporarily destroy the document being observed.
            if (/execution context was destroyed|cannot find context/i.test(error.message)) return undefined;
            throw error;
          }
        }, { run, launching: true });
        if (value?.alert) fail(`Lutri Verify showed an error: ${value.alert}\n${logTail()}`);
        if (uiReady(value)) {
          if (value.lang === "en" && value.heading === "Creation") {
            if (value.credentialStatus !== "API key required") fail("Expected an empty verify keychain at startup.");
            child.unref();
            console.log(JSON.stringify({ ...run, probe: value }, null, 2));
            return;
          }
          if (!pinned) {
            await withPage(async (send) => {
              await send("Runtime.evaluate", {
                expression: `localStorage.setItem("lutri.locale", "en")`,
                returnByValue: true,
              });
              await send("Page.reload", { ignoreCache: true });
            }, { run });
            pinned = true;
          }
        }
      }
      await sleep(1000);
    }
    fail(`Timed out waiting for Lutri Verify.\n${logTail()}`);
  } catch (error) {
    try {
      if (run.startedAt) processControl("stop", run);
      else child.kill(); // Native handle from this spawn, before a run record exists.
    } catch (stopError) {
      fail(`${error.message}\nVerify launcher could not be stopped: ${stopError.message}`);
    }
    throw error;
  }
}

function expectedExe() {
  return path.join(targetDir, "debug", "lutri.exe");
}

async function doctor() {
  assertWindows();
  const run = readRun();
  const exe = expectedExe();
  const database = path.join(dataDir, "lutri.sqlite3");
  if (!fs.existsSync(database)) fail(`Missing ${database}`);
  const value = await withPage(probe, { run });
  if (!uiReady(value) || value.lang !== "en" || value.title !== "Lutri")
    fail(`Instance is not ready: ${JSON.stringify(value)}`);
  console.log(JSON.stringify({ ...run, exe, probe: value }, null, 2));
}

async function state(argv) {
  const expected = {
    heading: option(argv, "--heading"),
    palette: option(argv, "--palette"),
    settingsCategory: option(argv, "--category"),
  };
  const fields = Object.entries(expected).filter(([, value]) => value !== undefined);
  const provider = option(argv, "--provider");
  const result = await withPage(async (send) => {
    const deadline = Date.now() + (fields.length || provider ? 10000 : 0);
    let value;
    do {
      value = await probe(send);
      if (value.alert) fail(`Error banner: ${value.alert}`);
      if (uiReady(value) && fields.every(([name, wanted]) => value[name] === wanted) &&
          (provider === undefined || value.openProviders.includes(provider))) return value;
      await sleep(200);
    } while (Date.now() < deadline);
    fail(`Expected ${JSON.stringify({ ...expected, provider })}. Observed ${JSON.stringify(value)}`);
  });
  const output = JSON.stringify(result, null, 2);
  const destination = option(argv, "--path");
  if (destination) {
    fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
    fs.writeFileSync(destination, output + "\n");
  }
  console.log(output);
}

async function click(argv) {
  const role = requireOption(argv, "--role");
  const name = requireOption(argv, "--name");
  await withPage(async (send) => {
    await clickNode(send, await findNode(send, role, name));
  });
}

async function fill(argv) {
  const role = requireOption(argv, "--role");
  const name = requireOption(argv, "--name");
  const value = requireOption(argv, "--value");
  await withPage(async (send) => {
    const node = await findNode(send, role, name);
    const resolved = await send("DOM.resolveNode", { backendNodeId: node.backendDOMNodeId });
    await send("Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() { this.focus(); }`,
    });
    await send("Input.insertText", { text: value });
    const deadline = Date.now() + 5000;
    let current = "";
    while (Date.now() < deadline) {
      current = await nodeText(send, await findNode(send, role, name));
      if (current === value) {
        console.log(current);
        return;
      }
      await sleep(200);
    }
    fail(`Control reads ${JSON.stringify(current)} after fill, expected ${JSON.stringify(value)}`);
  });
}

async function text(argv) {
  const role = requireOption(argv, "--role");
  const name = requireOption(argv, "--name");
  const expected = option(argv, "--equals");
  const current = await withPage(async (send) => nodeText(send, await findNode(send, role, name)));
  if (expected !== undefined && current !== expected) fail(`Control reads ${JSON.stringify(current)}`);
  console.log(current);
}

function snapshotText(value, nodes) {
  const lines = [
    `title: ${value.title}`,
    `url: ${value.url}`,
    `lang: ${value.lang}`,
    `heading: ${value.heading}`,
    `palette: ${value.palette}`,
    `accent: ${value.accent}`,
    `credential: ${value.credential}`,
    `alert: ${value.alert || "-"}`,
    "",
  ];
  for (const node of nodes) {
    lines.push(`${node.role.value} ${JSON.stringify(nodeName(node))}${axFlags(node)}`);
  }
  return lines.join("\n") + "\n";
}

async function snapshot(argv) {
  const destination = path.resolve(requireOption(argv, "--path"));
  const wanted = options(argv, "--contains");
  const snapshot = await withPage(async (send) => snapshotText(await probe(send), await axNodes(send)));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, snapshot);
  const missing = wanted.filter((needle) => !snapshot.includes(needle));
  if (missing.length)
    fail(`Snapshot ${destination} is missing ${missing.map((needle) => JSON.stringify(needle)).join(", ")}`);
  console.log(destination);
}

async function screenshot(argv) {
  const destination = path.resolve(requireOption(argv, "--path"));
  const image = await withPage(async (send) => {
    await send("Page.bringToFront");
    return send("Page.captureScreenshot", { format: "png" });
  });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(image.data, "base64"));
  console.log(destination);
}

async function readRecord(argv) {
  assertWindows();
  if (!insideRecipe) processControl("check", readRun());
  const collection = requireOption(argv, "--collection");
  const id = requireOption(argv, "--id");
  const field = option(argv, "--field");
  const expected = option(argv, "--equals");
  const destination = option(argv, "--path");
  const database = path.join(dataDir, "lutri.sqlite3");
  if (!fs.existsSync(database)) fail(`Missing ${database}`);
  const deadline = Date.now() + (field ? 10000 : 0);
  let body;
  do {
    try {
      const db = new DatabaseSync(database, { readOnly: true });
      try {
        body = db.prepare("SELECT body FROM records WHERE collection = ? AND id = ?").get(collection, id)?.body;
      } finally {
        db.close();
      }
    } catch {
      body = undefined;
    }
    if (body && (!field || JSON.parse(body)[field] === expected)) break;
    await sleep(200);
  } while (Date.now() < deadline);
  if (!body) fail(`No ${collection}/${id} record in the verify database.`);
  const parsed = JSON.parse(body);
  if (field && parsed[field] !== expected) fail(`${collection}/${id} ${field} is ${JSON.stringify(parsed[field])}`);
  const output = JSON.stringify(parsed, null, 2);
  if (destination) {
    const file = path.resolve(destination);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, output + "\n");
    console.log(file);
  } else console.log(output);
}

async function cleanup() {
  assertWindows();
  const run = readRun();
  if (run && alive(run.pid)) processControl("stop", run);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && ((await portOpen(DEBUG_PORT)) || (await portOpen(DEV_PORT)))) {
    await sleep(300);
  }
  processControl("idle");
  removeExactDir(webviewDir, webviewDir);
  removeExactDir(dataDir, dataDir);
  if (fs.existsSync(runPath)) fs.rmSync(runPath);
  console.log("cleaned");
}

const drivable = new Set(["state", "click", "fill", "text", "snapshot", "screenshot", "read-record"]);

function tokenize(line) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

async function run(argv) {
  const file = path.resolve(requireOption(argv, "--path"));
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  processControl("check", readRun());
  insideRecipe = true;
  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line || line.startsWith("#")) continue;
      const [name, ...args] = tokenize(line);
      if (!drivable.has(name))
        fail(`Line ${index + 1}: cannot run ${JSON.stringify(name ?? "")} in a recipe. Use one of: ${[...drivable].join(", ")}`);
      console.log(`> ${line}`);
      try {
        await commands[name](args);
      } catch (error) {
        fail(`Line ${index + 1} failed: ${line}\n${error.message}`);
      }
    }
  } finally {
    insideRecipe = false;
  }
}

const commands = { launch, doctor, state, click, fill, text, snapshot, screenshot, "read-record": readRecord, run, cleanup };
const command = process.argv[2];
async function main() {
  assertWindows();
  if (!Object.hasOwn(commands, command)) fail(`Unknown command. Use one of: ${Object.keys(commands).join(", ")}`);
  // All checkouts share these ports and profiles. Serialize each command through an OS-owned pipe.
  const lock = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    lock.once("error", reject).listen(String.raw`\\.\pipe\LutriVerify-harness`, resolve);
  });
  try {
    await commands[command](process.argv);
  } finally {
    lock.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error && error.failure ? error.message : error?.stack || String(error));
  process.exit(1);
});
