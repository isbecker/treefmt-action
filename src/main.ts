import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";

async function run() {
	try {
		const inputVersion = core.getInput("version") || "latest";
		const configFile = core.getInput("config_file") || "treefmt.toml";
		const token = core.getInput("github_token");
		const allowMissingFormatter =
			core.getInput("allow_missing_formatter") === "true";
		const workingDirectory = core.getInput("working_directory") || ".";
		const noCache = core.getInput("no_cache") === "true";
		const failOnChange = core.getInput("fail_on_change") === "true";
		const formatters = core.getInput("formatters");
		const treeRoot = core.getInput("tree_root");
		const treeRootFile = core.getInput("tree_root_file");
		const walk = core.getInput("walk") || "auto";
		const verbose = core.getInput("verbose") === "true";
		const onUnmatched = core.getInput("on_unmatched") || "warn";

		const platform = process.platform;
		const arch = process.arch;
		const octokit = new Octokit({ auth: token });

		let version = inputVersion;
		let latest = inputVersion === "latest";
		let filename = getFilename(platform, arch, version);

		if (latest) {
			const release = await getLatestRelease(octokit);
			version = release.data.tag_name.replace("v", "");
			filename = filename.replace("latest", version);
		}

		const toolPath = tc.find("treefmt", version, arch);
		if (toolPath) {
			core.addPath(toolPath);
		} else {
			const downloadUrl = await getDownloadUrl(
				octokit,
				version,
				filename,
				latest,
			);
			const cachedPath = await downloadAndCacheTreefmt(
				downloadUrl,
				platform,
				version,
				arch,
			);
			core.addPath(cachedPath);
			ensureExecutable(platform, cachedPath);
		}

		const treefmtArgs = constructArgs({
			configFile,
			allowMissingFormatter,
			workingDirectory,
			noCache,
			failOnChange,
			formatters,
			treeRoot,
			treeRootFile,
			walk,
			verbose,
			onUnmatched,
		});

		const exitCode = await exec.exec("treefmt", treefmtArgs);
		if (exitCode !== 0) {
			throw new Error(`treefmt failed with exit code ${exitCode}`);
		}
	} catch (error: any) {
		core.setFailed(`Action failed with error: ${error.message}`);
	}
}

function getFilename(platform: string, arch: string, version: string): string {
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

async function getLatestRelease(octokit: Octokit) {
	return await octokit.rest.repos.getLatestRelease({
		owner: "numtide",
		repo: "treefmt",
	});
}

async function getDownloadUrl(
	octokit: Octokit,
	version: string,
	filename: string,
	latest: boolean,
) {
	let release;
	if (latest) {
		release = await getLatestRelease(octokit);
		version = release.data.tag_name.replace("v", "");
		filename = filename.replace("latest", version);
	} else {
		release = await octokit.rest.repos.getReleaseByTag({
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
}

async function downloadAndCacheTreefmt(
	downloadUrl: string,
	platform: string,
	version: string,
	arch: string,
) {
	const downloadPath = await tc.downloadTool(downloadUrl);
	const extractedPath =
		platform === "win32"
			? await tc.extractZip(downloadPath)
			: await tc.extractTar(downloadPath);
	return await tc.cacheDir(extractedPath, "treefmt", version, arch);
}

function ensureExecutable(platform: string, cachedPath: string) {
	if (platform !== "win32") {
		const treefmtPath = path.join(cachedPath, "treefmt");
		fs.chmodSync(treefmtPath, "755");
	}
}

function constructArgs(options: {
	configFile: string;
	allowMissingFormatter: boolean;
	workingDirectory: string;
	noCache: boolean;
	failOnChange: boolean;
	formatters?: string;
	treeRoot?: string;
	treeRootFile?: string;
	walk: string;
	verbose: boolean;
	onUnmatched: string;
}): string[] {
	const args = ["--config-file", options.configFile];
	if (options.allowMissingFormatter) args.push("--allow-missing-formatter");
	if (options.workingDirectory)
		args.push("--working-directory", options.workingDirectory);
	if (options.noCache) args.push("--no-cache");
	if (options.failOnChange) args.push("--fail-on-change");
	if (options.formatters) args.push("--formatters", options.formatters);
	if (options.treeRoot) args.push("--tree-root", options.treeRoot);
	if (options.treeRootFile) args.push("--tree-root-file", options.treeRootFile);
	if (options.walk) args.push("--walk", options.walk);
	if (options.verbose) args.push("--vv");
	if (options.onUnmatched) args.push("--on-unmatched", options.onUnmatched);
	return args;
}

run();
