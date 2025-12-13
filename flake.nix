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

        treefmt = {
          # Used to find the project root
          projectRootFile = "flake.nix";

          programs = {
            nixpkgs-fmt.enable = true;
            biome = {
              enable = true;
              excludes = [ "dist/*" "node_modules/*" ];
            };
            mdformat.enable = true;
            taplo.enable = true;
            yamlfmt.enable = true;
            just.enable = true;
          };
          settings.formatter = {
            taplo = {
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
            };
            yamlfmt = {
              options = [
                "-formatter"
                "indent=2"
                "-formatter"
                "retain_line_breaks=true"
                "-formatter"
                "indentless_arrays=true"
                "-formatter"
                "eof_newline=true"
                "-formatter"
                "scan_folded_as_literal=true"
              ];
              includes = [ "*.yaml" "*.yml" ];
            };
          };
        };

        devenv.shells = {
          default = {
            name = "treefmt-action";

            languages = {
              typescript = {
                enable = true;
              };
              javascript = {
                enable = true;
                npm.enable = true;
              };
            };

            git-hooks.hooks = {
              treefmt = {
                package = config.treefmt.build.wrapper;
                enable = true;
              };
            };

            packages = with pkgs; [
              act
              just
            ];
          };
          ci = {
            name = "treefmt-action-ci";

            git-hooks.hooks = {
              treefmt = {
                package = config.treefmt.build.wrapper;
                enable = true;
              };
            };
          };
        };

      };
    };
}
