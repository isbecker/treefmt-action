import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";

class ActionInputs {
	version: string;
	configFile: string;
	githubToken: string;
	allowMissingFormatter: boolean;
	workingDir: string;
	noCache: boolean;
	failOnChange: boolean;
	formatters: string;
	treeRoot: string;
	treeRootFile: string;
	walk: string;
	verbose: string;
	onUnmatched: string;
	ci: boolean;
	clearCache: boolean;
	excludes: string;
	stdin: boolean;
	init: boolean;

	constructor() {
		this.version = this.inputOrDefault("version", "latest") as string;
		this.configFile = this.inputOrDefault(
			"config_file",
			"treefmt.toml",
		) as string;
		this.githubToken = this.inputOrDefault("github_token") as string;
		this.allowMissingFormatter = this.inputOrDefault(
			"allow_missing_formatter",
		) as boolean;
		this.workingDir = this.inputOrDefault("working_dir") as string;
		this.noCache = this.inputOrDefault("no_cache") as boolean;
		this.failOnChange = this.inputOrDefault("fail_on_change") as boolean;
		this.formatters = this.inputOrDefault("formatters") as string;
		this.treeRoot = this.inputOrDefault("tree_root") as string;
		this.treeRootFile = this.inputOrDefault("tree_root_file") as string;
		this.walk = this.inputOrDefault("walk", "auto") as string;
		this.verbose = this.inputOrDefault("verbose", "0") as string;
		this.onUnmatched = this.inputOrDefault("on_unmatched", "warn") as string;
		this.ci = this.inputOrDefault("ci") as boolean;
		this.clearCache = this.inputOrDefault("clear_cache") as boolean;
		this.excludes = this.inputOrDefault("excludes") as string;
		this.stdin = this.inputOrDefault("stdin") as boolean;
		this.init = this.inputOrDefault("init") as boolean;
	}

	private inputOrDefault<T extends string | boolean>(
		name: string,
		defaultValue?: T,
	): T {
		const value = core.getInput(name);
		if (value === "") {
			return defaultValue!;
		}
		if (value === "true") {
			return true as T;
		} else if (value === "false") {
			return false as T;
		}
		return value as T;
	}
}

async function run() {
	try {
		const inputs = new ActionInputs();
		const platform = process.platform;
		const arch = process.arch;
		const octokit: ReturnType<typeof github.getOctokit> = github.getOctokit(
			inputs.githubToken,
		);

		let version = inputs.version;
		let latest = inputs.version === "latest";
		let filename = getFilename(platform, arch, version);

		if (latest) {
			const release = await getLatestRelease(octokit);
			version = release.data.tag_name.replace("v", "");
			filename = getFilename(platform, arch, version);
		}

		let toolPath = tc.find("treefmt", version, arch);
		if (!toolPath) {
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
			ensureExecutable(platform, cachedPath);
			toolPath = cachedPath;
		}
		core.addPath(toolPath);

		const treefmtArgs = constructArgs(inputs);

		await exec.exec("treefmt", treefmtArgs);
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

async function getLatestRelease(
	octokit: ReturnType<typeof github.getOctokit>,
): Promise<ReturnType<typeof octokit.rest.repos.getLatestRelease>> {
	return await octokit.rest.repos.getLatestRelease({
		owner: "numtide",
		repo: "treefmt",
	});
}

async function getDownloadUrl(
	octokit: ReturnType<typeof github.getOctokit>,
	version: string,
	filename: string,
	latest: boolean,
): Promise<string> {
	let release: Awaited<
		| ReturnType<typeof octokit.rest.repos.getLatestRelease>
		| ReturnType<typeof octokit.rest.repos.getReleaseByTag>
	>;
	if (latest) {
		release = await getLatestRelease(octokit);
		version = release.data.tag_name.replace("v", "");
		filename = getFilename(process.platform, process.arch, version);
	} else {
		release = await octokit.rest.repos.getReleaseByTag({
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
}

async function downloadAndCacheTreefmt(
	downloadUrl: string,
	platform: string,
	version: string,
	arch: string,
): Promise<string> {
	const downloadPath = await tc.downloadTool(downloadUrl);
	const extractedPath =
		platform === "win32"
			? await tc.extractZip(downloadPath)
			: await tc.extractTar(downloadPath);
	return await tc.cacheDir(extractedPath, "treefmt", version, arch);
}

function ensureExecutable(platform: string, cachedPath: string): void {
	if (platform !== "win32") {
		const treefmtPath = path.join(cachedPath, "treefmt");
		fs.chmodSync(treefmtPath, "755");
	}
}

function constructArgs(inputs: ActionInputs): string[] {
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
