import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import * as tc from "@actions/tool-cache";

async function run() {
	try {
		// Get the inputs
		const inputVersion = core.getInput("version") || "latest";
		const configFile = core.getInput("config-file") || "treefmt.toml";

		// Determine the platform and architecture
		const platform = process.platform;
		let arch = process.arch;
		const token = core.getInput("github_token");
		const octokit = new Octokit({ auth: token });

		let version = inputVersion;
		let latest = false;
		let filename = "";

		if (platform === "win32") {
			switch (arch) {
				case "x64":
					filename = "treefmt-x86_64-pc-windows-msvc.zip";
					break;
				case "arm64":
					filename = "treefmt-aarch64-pc-windows-msvc.zip";
					break;
				default:
					throw new Error(
						`Unsupported platform/arch combination: ${platform}-${arch}`,
					);
			}
			version = "v0.6.1";
			latest = false;
		} else {
			switch (`${platform}-${arch}`) {
				case "linux-x64":
					filename = `treefmt_${inputVersion}_linux_amd64.tar.gz`;
					break;
				case "linux-arm64":
					filename = `treefmt_${inputVersion}_linux_${arch}.tar.gz`;
					break;
				case "darwin-x64":
					filename = `treefmt_${inputVersion}_darwin_amd64.tar.gz`;
					break;
				case "darwin-arm64":
					filename = `treefmt_${inputVersion}_darwin_${arch}.tar.gz`;
					break;
				default:
					throw new Error(
						`Unsupported platform/arch combination: ${platform}-${arch}`,
					);
			}
			latest = inputVersion === "latest";
			version = inputVersion;
		}

		// Fetch the release
		let release;
		if (latest) {
			release = await octokit.rest.repos.getLatestRelease({
				owner: "numtide",
				repo: "treefmt",
			});
			version = release.data.tag_name;
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

		const downloadUrl = asset.browser_download_url;

		// Download and extract treefmt
		const downloadPath = await tc.downloadTool(downloadUrl);
		let extractedPath;
		if (platform === "win32") {
			extractedPath = await tc.extractZip(downloadPath);
		} else {
			extractedPath = await tc.extractTar(downloadPath);
		}

		// Add the binary to PATH
		const cachedPath = await tc.cacheDir(
			extractedPath,
			"treefmt",
			version,
			arch,
		);
		core.addPath(cachedPath);

		// Make sure the binary is executable on Unix-like systems
		if (platform !== "win32") {
			const treefmtPath = path.join(cachedPath, "treefmt");
			fs.chmodSync(treefmtPath, "755");
		}

		// Run treefmt
		await exec.exec(`treefmt --config-file=${configFile}`);
	} catch (error: any) {
		core.setFailed(error.message);
	}
}

run();
