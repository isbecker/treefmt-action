var __awaiter =
	(this && this.__awaiter) ||
	function (thisArg, _arguments, P, generator) {
		function adopt(value) {
			return value instanceof P
				? value
				: new P(function (resolve) {
						resolve(value);
					});
		}
		return new (P || (P = Promise))(function (resolve, reject) {
			function fulfilled(value) {
				try {
					step(generator.next(value));
				} catch (e) {
					reject(e);
				}
			}
			function rejected(value) {
				try {
					step(generator["throw"](value));
				} catch (e) {
					reject(e);
				}
			}
			function step(result) {
				result.done
					? resolve(result.value)
					: adopt(result.value).then(fulfilled, rejected);
			}
			step((generator = generator.apply(thisArg, _arguments || [])).next());
		});
	};
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";
class ActionInputs {
	constructor() {
		this.version = this.inputOrDefault("version", "latest");
		this.configFile = this.inputOrDefault("config_file", "treefmt.toml");
		this.githubToken = this.inputOrDefault("github_token");
		this.allowMissingFormatter = this.inputOrDefault("allow_missing_formatter");
		this.workingDir = this.inputOrDefault("working_dir");
		this.noCache = this.inputOrDefault("no_cache");
		this.failOnChange = this.inputOrDefault("fail_on_change");
		this.formatters = this.inputOrDefault("formatters");
		this.treeRoot = this.inputOrDefault("tree_root");
		this.treeRootFile = this.inputOrDefault("tree_root_file");
		this.walk = this.inputOrDefault("walk", "auto");
		this.verbose = this.inputOrDefault("verbose", "0");
		this.onUnmatched = this.inputOrDefault("on_unmatched", "warn");
		this.ci = this.inputOrDefault("ci");
		this.clearCache = this.inputOrDefault("clear_cache");
		this.excludes = this.inputOrDefault("excludes");
		this.stdin = this.inputOrDefault("stdin");
		this.init = this.inputOrDefault("init");
	}
	inputOrDefault(name, defaultValue) {
		const value = core.getInput(name);
		if (value === "") {
			return defaultValue;
		}
		if (value === "true") {
			return true;
		} else if (value === "false") {
			return false;
		}
		return value;
	}
}
function run() {
	return __awaiter(this, void 0, void 0, function* () {
		try {
			const inputs = new ActionInputs();
			const platform = process.platform;
			const arch = process.arch;
			const octokit = github.getOctokit(inputs.githubToken);
			let version = inputs.version;
			let latest = inputs.version === "latest";
			let filename = getFilename(platform, arch, version);
			if (latest) {
				const release = yield getLatestRelease(octokit);
				version = release.data.tag_name.replace("v", "");
				filename = getFilename(platform, arch, version);
			}
			let toolPath = tc.find("treefmt", version, arch);
			if (!toolPath) {
				const downloadUrl = yield getDownloadUrl(
					octokit,
					version,
					filename,
					latest,
				);
				const cachedPath = yield downloadAndCacheTreefmt(
					downloadUrl,
					platform,
					version,
					arch,
				);
				ensureExecutable(platform, cachedPath);
				toolPath = cachedPath;
			}
			core.addPath(toolPath);
			const treefmtArgs = constructArgs(inputs);
			yield exec.exec("treefmt", treefmtArgs);
		} catch (error) {
			core.setFailed(`Action failed with error: ${error.message}`);
		}
	});
}
function getFilename(platform, arch, version) {
	if (platform === "win32") {
		if (arch === "x64") {
			return "treefmt-x86_64-pc-windows-msvc.zip";
		} else if (arch === "arm64") {
			return "treefmt-aarch64-pc-windows-msvc.zip";
		} else {
			throw new Error(
				`Unsupported platform/arch combination: ${platform}-${arch}`,
			);
		}
	} else {
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
				throw new Error(
					`Unsupported platform/arch combination: ${platform}-${arch}`,
				);
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
			filename = getFilename(process.platform, process.arch, version);
		} else {
			release = yield octokit.rest.repos.getReleaseByTag({
				owner: "numtide",
				repo: "treefmt",
				tag: `v${version}`,
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
		const extractedPath =
			platform === "win32"
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
function constructArgs(inputs) {
	const args = [];
	if (inputs.configFile) args.push("--config-file", inputs.configFile);
	if (inputs.allowMissingFormatter) args.push("--allow-missing-formatter");
	if (inputs.workingDir) args.push("-C", inputs.workingDir);
	if (inputs.noCache) args.push("--no-cache");
	if (inputs.failOnChange) args.push("--fail-on-change");
	if (inputs.formatters) args.push("--formatters", inputs.formatters);
	if (inputs.treeRoot) args.push("--tree-root", inputs.treeRoot);
	if (inputs.treeRootFile) args.push("--tree-root-file", inputs.treeRootFile);
	if (inputs.walk) args.push("--walk", inputs.walk);
	if (inputs.verbose && Number(inputs.verbose) > 0) {
		args.push("-" + "v".repeat(Number(inputs.verbose)));
	}
	if (inputs.onUnmatched) args.push("--on-unmatched", inputs.onUnmatched);
	if (inputs.ci) args.push("--ci");
	if (inputs.clearCache) args.push("--clear-cache");
	if (inputs.excludes) args.push("--excludes", inputs.excludes);
	if (inputs.stdin) args.push("--stdin");
	if (inputs.init) args.push("--init");
	return args;
}
run();
