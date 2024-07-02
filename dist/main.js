"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const rest_1 = require("@octokit/rest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tc = __importStar(require("@actions/tool-cache"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get the inputs
            const inputVersion = core.getInput('version') || 'latest';
            const configFile = core.getInput('config-file') || 'treefmt.toml';
            // Determine the platform and architecture
            const platform = process.platform;
            let arch = process.arch;
            const token = core.getInput('github_token');
            const octokit = new rest_1.Octokit({ auth: token });
            let version = inputVersion;
            let latest = false;
            let filename = '';
            if (platform === 'win32') {
                switch (arch) {
                    case 'x64':
                        filename = 'treefmt-x86_64-pc-windows-msvc.zip';
                        break;
                    case 'arm64':
                        filename = 'treefmt-aarch64-pc-windows-msvc.zip';
                        break;
                    default:
                        throw new Error(`Unsupported platform/arch combination: ${platform}-${arch}`);
                }
                version = 'v0.6.1';
                latest = false;
            }
            else {
                switch (`${platform}-${arch}`) {
                    case 'linux-x64':
                        filename = `treefmt_${inputVersion}_linux_amd64.tar.gz`;
                        break;
                    case 'linux-arm64':
                        filename = `treefmt_${inputVersion}_linux_${arch}.tar.gz`;
                        break;
                    case 'darwin-x64':
                        filename = `treefmt_${inputVersion}_darwin_amd64.tar.gz`;
                        break;
                    case 'darwin-arm64':
                        filename = `treefmt_${inputVersion}_darwin_${arch}.tar.gz`;
                        break;
                    default:
                        throw new Error(`Unsupported platform/arch combination: ${platform}-${arch}`);
                }
                latest = inputVersion === 'latest';
                version = inputVersion;
            }
            // Fetch the release
            let release;
            if (latest) {
                release = yield octokit.rest.repos.getLatestRelease({ owner: 'numtide', repo: 'treefmt' });
                version = release.data.tag_name;
                filename = filename.replace('latest', version);
            }
            else {
                release = yield octokit.rest.repos.getReleaseByTag({ owner: 'numtide', repo: 'treefmt', tag: version });
            }
            const asset = release.data.assets.find(a => a.name === filename);
            if (!asset) {
                throw new Error(`Asset not found: ${filename}`);
            }
            const downloadUrl = asset.browser_download_url;
            // Download and extract treefmt
            const downloadPath = yield tc.downloadTool(downloadUrl);
            let extractedPath;
            if (platform === 'win32') {
                extractedPath = yield tc.extractZip(downloadPath);
            }
            else {
                extractedPath = yield tc.extractTar(downloadPath);
            }
            // Add the binary to PATH
            const cachedPath = yield tc.cacheDir(extractedPath, 'treefmt', version, arch);
            core.addPath(cachedPath);
            // Make sure the binary is executable on Unix-like systems
            if (platform !== 'win32') {
                const treefmtPath = path.join(cachedPath, 'treefmt');
                fs.chmodSync(treefmtPath, '755');
            }
            // Run treefmt
            yield exec.exec(`treefmt --config-file=${configFile}`);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
