import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";
import semver from "semver";

class ActionInputs {
	version: string | undefined;
	githubToken: string | undefined;
	configFile: string | undefined;
	allowMissingFormatter: boolean | undefined;
	workingDir: string | undefined;
	noCache: boolean | undefined;
	failOnChange: boolean | undefined;
	formatters: string | undefined;
	treeRoot: string | undefined;
	treeRootFile: string | undefined;
	walk: string | undefined;
	verbose: string | undefined;
	onUnmatched: string | undefined;
	ci: boolean | undefined;
	clearCache: boolean | undefined;
	excludes: string | undefined;
	stdin: boolean | undefined;
	init: boolean | undefined;

	constructor() {
		// required inputs
		this.version = this.getRaw("version");
		this.githubToken = this.getRaw("github-token");

		// optional inputs
		this.configFile = this.getRaw("config-file");
		this.allowMissingFormatter = this.getBool("allow-missing-formatter");
		this.workingDir = this.getRaw("working-dir");
		this.noCache = this.getBool("no-cache");
		this.failOnChange = this.getBool("fail-on-change");
		this.formatters = this.getRaw("formatters");
		this.treeRoot = this.getRaw("tree-root");
		this.treeRootFile = this.getRaw("tree-root-file");
		this.walk = this.getRaw("walk");
		this.verbose = this.getRaw("verbose");
		this.onUnmatched = this.getRaw("on-unmatched");
		this.ci = this.getBool("ci");
		this.clearCache = this.getBool("clear-cache");
		this.excludes = this.getRaw("excludes");
	}

	getRaw = (name: string): string | undefined => {
		const v = core.getInput(name, { trimWhitespace: true });
		return v === "" ? undefined : v;
	};

	getBool = (name: string): boolean | undefined => {
		const v = this.getRaw(name);
		if (v === undefined) return undefined;
		if (/^(true|True|TRUE)$/.test(v)) return true;
		if (/^(false|False|FALSE)$/.test(v)) return false;
		throw new Error(`Invalid boolean for "${name}": ${v}`);
	};
}

async function run() {
	try {
		const inputs = new ActionInputs();
		if (!inputs.githubToken) {
			core.setFailed("GitHub token is required.");
			return;
		}
		if (!inputs.version) {
			core.setFailed("Version is required.");
			return;
		}
		const platform = process.platform;
		const arch = process.arch;
		const octokit: ReturnType<typeof github.getOctokit> = github.getOctokit(
			inputs.githubToken,
		);

		let version = inputs.version;
		const requestedLatest = version === "latest";
		const requestedSystem = version === "system";
		let useSystemTreefmt = false;
		const existingTreefmtVersion = await detectTreefmtVersion();

		if (requestedSystem) {
			if (existingTreefmtVersion) {
				core.info(`Using treefmt ${existingTreefmtVersion} found in PATH.`);
				useSystemTreefmt = true;
				version = existingTreefmtVersion;
			} else {
				core.warning(
					"Requested to use system treefmt, but none was found in PATH. Falling back to installation with latest version.",
				);
				useSystemTreefmt = false;
				version = "latest";
			}
		}

		if (!useSystemTreefmt) {
			let resolvedVersion = semver.coerce(version || "")?.version || null;
			if (requestedLatest) {
				const release = await getLatestRelease(octokit);
				resolvedVersion = semver.coerce(release.data.tag_name)?.version || null;
			}
			if (!resolvedVersion) {
				throw new Error("Could not resolve treefmt version to install.");
			}
			const filename = getFilename(platform, arch, resolvedVersion);
			let toolPath = tc.find("treefmt", resolvedVersion, arch);
			if (!toolPath) {
				const downloadUrl = await getDownloadUrl(
					octokit,
					resolvedVersion,
					filename,
					requestedLatest,
				);
				const cachedPath = await downloadAndCacheTreefmt(
					downloadUrl,
					platform,
					resolvedVersion,
					arch,
				);
				ensureExecutable(platform, cachedPath);
				toolPath = cachedPath;
			}
			core.addPath(toolPath);
		}

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
		version = semver.coerce(release.data.tag_name)?.version || version;
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
	return args;
}

async function detectTreefmtVersion(): Promise<string | null> {
	try {
		const result = await exec.getExecOutput("treefmt", ["--version"], {
			ignoreReturnCode: true,
			silent: true,
		});
		if (result.exitCode !== 0) {
			return null;
		}
		const stdout = result.stdout.trim();
		if (!stdout) {
			return null;
		}
		const match = semver.coerce(stdout);
		return match ? match.version : null;
	} catch (error) {
		core.debug(`Failed to detect existing treefmt: ${String(error)}`);
		return null;
	}
}

run();
