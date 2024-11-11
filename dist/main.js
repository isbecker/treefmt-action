var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const inputVersion = core.getInput("version") || "latest";
            const configFile = core.getInput("config_file") || "treefmt.toml";
            const token = core.getInput("github_token");
            const allowMissingFormatter = core.getInput("allow_missing_formatter") === "true";
            const workingDir = core.getInput("working_dir");
            const noCache = core.getInput("no_cache") === "true";
            const failOnChange = core.getInput("fail_on_change") === "true";
            const formatters = core.getInput("formatters");
            const treeRoot = core.getInput("tree_root");
            const treeRootFile = core.getInput("tree_root_file");
            const walk = core.getInput("walk") || "auto";
            const verbose = core.getInput("verbose") || "0";
            const onUnmatched = core.getInput("on_unmatched") || "warn";
            const ci = core.getInput("ci") === "true";
            const clearCache = core.getInput("clear_cache") === "true";
            const excludes = core.getInput("excludes");
            const stdin = core.getInput("stdin") === "true";
            const init = core.getInput("init") === "true";
            const platform = process.platform;
            const arch = process.arch;
            const octokit = new Octokit({ auth: token });
            let version = inputVersion;
            let latest = inputVersion === "latest";
            let filename = getFilename(platform, arch, version);
            if (latest) {
                const release = yield getLatestRelease(octokit);
                version = release.data.tag_name.replace("v", "");
                filename = filename.replace("latest", version);
            }
            const toolPath = tc.find("treefmt", version, arch);
            if (toolPath) {
                core.addPath(toolPath);
            }
            else {
                const downloadUrl = yield getDownloadUrl(octokit, version, filename, latest);
                const cachedPath = yield downloadAndCacheTreefmt(downloadUrl, platform, version, arch);
                ensureExecutable(platform, cachedPath);
            }
            const treefmtArgs = constructArgs({
                configFile,
                allowMissingFormatter,
                workingDir,
                noCache,
                failOnChange,
                formatters,
                treeRoot,
                treeRootFile,
                walk,
                verbose,
                onUnmatched,
                ci,
                clearCache,
                excludes,
                stdin,
                init,
            });
            yield exec.exec("treefmt", treefmtArgs);
        }
        catch (error) {
            core.setFailed(`Action failed with error: ${error.message}`);
        }
    });
}
function getFilename(platform, arch, version) {
    if (platform === "win32") {
        if (arch === "x64") {
            return "treefmt-x86_64-pc-windows-msvc.zip";
        }
        else if (arch === "arm64") {
            return "treefmt-aarch64-pc-windows-msvc.zip";
        }
        else {
            throw new Error(`Unsupported platform/arch combination: ${platform}-${arch}`);
        }
    }
    else {
        switch (`${platform}-${arch}`) {
            case "linux-x64":
                return `treefmt_${version}_linux_amd64.tar.gz`;
            case "linux-arm64":
                return `treefmt_${version}_linux_${arch}.tar.gz`;
            case "darwin-x64":
                return `treefmt_${version}_darwin_amd64.tar.gz`;
            case "darwin-arm64":
                return `treefmt_${version}_darwin_${arch}.tar.gz`;
            default:
                throw new Error(`Unsupported platform/arch combination: ${platform}-${arch}`);
        }
    }
}
function getLatestRelease(octokit) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield octokit.rest.repos.getLatestRelease({
            owner: "numtide",
            repo: "treefmt",
        });
    });
}
function getDownloadUrl(octokit, version, filename, latest) {
    return __awaiter(this, void 0, void 0, function* () {
        let release;
        if (latest) {
            release = yield getLatestRelease(octokit);
            version = release.data.tag_name.replace("v", "");
            filename = filename.replace("latest", version);
        }
        else {
            release = yield octokit.rest.repos.getReleaseByTag({
                owner: "numtide",
                repo: "treefmt",
                tag: version,
            });
        }
        const asset = release.data.assets.find((a) => a.name === filename);
        if (!asset) {
            throw new Error(`Asset not found: ${filename}`);
        }
        return asset.browser_download_url;
    });
}
function downloadAndCacheTreefmt(downloadUrl, platform, version, arch) {
    return __awaiter(this, void 0, void 0, function* () {
        const downloadPath = yield tc.downloadTool(downloadUrl);
        const extractedPath = platform === "win32"
            ? yield tc.extractZip(downloadPath)
            : yield tc.extractTar(downloadPath);
        return yield tc.cacheDir(extractedPath, "treefmt", version, arch);
    });
}
function ensureExecutable(platform, cachedPath) {
    if (platform !== "win32") {
        const treefmtPath = path.join(cachedPath, "treefmt");
        fs.chmodSync(treefmtPath, "755");
    }
}
function constructArgs(options) {
    const args = ["--config-file", options.configFile];
    if (options.allowMissingFormatter)
        args.push("--allow-missing-formatter");
    if (options.workingDir)
        args.push("-C", options.workingDir);
    if (options.noCache)
        args.push("--no-cache");
    if (options.failOnChange)
        args.push("--fail-on-change");
    if (options.formatters)
        args.push("--formatters", options.formatters);
    if (options.treeRoot)
        args.push("--tree-root", options.treeRoot);
    if (options.treeRootFile)
        args.push("--tree-root-file", options.treeRootFile);
    if (options.walk)
        args.push("--walk", options.walk);
    if (options.verbose && Number(options.verbose) > 0) {
        args.push("-" + "v".repeat(Number(options.verbose)));
    }
    if (options.onUnmatched)
        args.push("--on-unmatched", options.onUnmatched);
    if (options.ci)
        args.push("--ci");
    if (options.clearCache)
        args.push("--clear-cache");
    if (options.excludes)
        args.push("--excludes", options.excludes);
    if (options.stdin)
        args.push("--stdin");
    if (options.init)
        args.push("--init");
    return args;
}
run();
