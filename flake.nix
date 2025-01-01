{
  description = "GitHub action for treefmt";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv.url = "github:cachix/devenv";
    treefmt-nix.url = "github:numtide/treefmt-nix";

    nix2container = {
      url = "github:nlewo/nix2container";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    mk-shell-bin.url = "github:rrbutani/nix-mk-shell-bin";

  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.devenv.flakeModule
        inputs.treefmt-nix.flakeModule

      ];
      systems = [ "x86_64-linux" "i686-linux" "x86_64-darwin" "aarch64-linux" "aarch64-darwin" ];

      perSystem = { config, self', inputs', pkgs, system, lib, ... }: {
        packages.default = pkgs.git;

        treefmt = {
          # Used to find the project root
          projectRootFile = "flake.nix";

          programs = {
            nixpkgs-fmt = {
              enable = true;
              package = pkgs.nixpkgs-fmt;
            };
            biome = {
              enable = true;
              package = pkgs.biome;
            };
            mdformat = {
              enable = true;
              package = pkgs.mdformat;
            };
            taplo = {
              enable = true;
              package = pkgs.taplo;
            };
          };
          settings.formatter = {
            nix = {
              command = "nixpkgs-fmt";
              includes = [ "*.nix" ];
            };
            typescript = {
              command = "biome";
              options = [ "format" "--write" "--no-errors-on-unmatched" ];
              includes = [ "*.ts" "*.json" "*.js" "*.jsx" "*.tsx" ];
              excludes = [ "dist/*" "node_modules/*" ];
            };
            toml = {
              command = "taplo";
              options = [
                "fmt"
                "-oalign_entries=true"
                "-oalign_comments=true"
                "-oarray_trailing_comma=true"
                "-oarray_auto_expand=true"
                "-oarray_auto_collapse=true"
                "-oindent_tables=false"
                "-oindent_entries=false"
              ];
              includes = [ "*.toml" ];
            };
            markdown = {
              command = "mdformat";
              includes = [ "*.md" ];
            };

          };
        };

        devenv.shells.default = {
          name = "treefmt-action";

          devcontainer.enable = true;

          dotenv = {
            enable = true;
            filename = ".env.local";
          };

          languages = {
            typescript = {
              enable = true;
            };
            javascript = {
              enable = true;
              npm.enable = true;
            };
          };

          pre-commit.hooks = {
            treefmt = {
              package = pkgs.treefmt2;
              enable = true;
              settings = {
                formatters = [
                  pkgs.nixpkgs-fmt
                  pkgs.biome
                  pkgs.mdformat
                  pkgs.taplo # TOML - primarily just for the treefmt config files
                  pkgs.typos
                ];
              };
            };
          };

          packages = with pkgs; [

            config.packages.default
            act

          ];
        };
      };
    };
}
