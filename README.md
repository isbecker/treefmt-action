# Treefmt GitHub Action

This action installs and runs `treefmt` on your repository.

Currently, if you run this action on a Windows-based runner, it will use the older `treefmt` version 0.6.1.
This is because the newer versions of `treefmt` are not yet supported on Windows.

I would recommend using a Linux-based runner if you want to use the latest version of `treefmt`.
I doubt you will need to run this action on Windows anyway, as it is intended for CI/CD pipelines.

## Example usage

This example is more or less taken from the [test.yml](./.github/workflows/test.yml)
workflow in this repo.

```yaml
name: Format Code

on: [push, pull_request]

jobs:
  format:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2
    # setup some formatters
    - uses: biomejs/setup-biome@v2.2.1
    - uses: uncenter/setup-taplo@v1.0.8
    - name: Run treefmt
      uses: isbecker/treefmt-action@v2
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
        version: 'latest'
        ci: true
```

Note that you need to set up the formatters you want to use before running `treefmt`.
Many formatters are available as actions on the GitHub Marketplace.

## Inputs

### `version`

**Optional** The version of `treefmt` to install. Default `"latest"`.

### `github-token`

**Required** GitHub token for accessing the API.

### `config-file`

**Optional** Path to the `treefmt` configuration file. Default `"treefmt.toml"`.

### `allow-missing-formatter`

**Optional** Do not exit with error if a configured formatter is missing. Default `"false"`.

### `working-dir`

**Optional** Run as if `treefmt` was started in the specified working directory instead of the current working directory. Default `"."`.

### `ci`

**Optional** Run `treefmt` in CI mode, which implies `--no-cache`, `--fail-on-change`, and a few other CI-friendly settings. Default `"true"`.

### `no-cache`

**Optional** Ignore the evaluation cache entirely. Useful for CI. Default `"false"`.

### `fail-on-change`

**Optional** Exit with error if any changes were made. Useful for CI. Default `"false"`.

### `formatters`

**Optional** Specify formatters to apply. Defaults to all formatters.

### `tree-root`

**Optional** The root directory from which `treefmt` will start walking the filesystem.

### `tree-root-file`

**Optional** File to search for to find the project root (if `--tree-root` is not passed).

### `tree-root-cmd`

**Optional** Command to execute for discovering the tree root. Useful when non-standard tooling determines the project root.

### `walk`

**Optional** The method used to traverse the files within `--tree-root`. Supports 'auto', 'git' or 'filesystem'. Default `"auto"`.

### `verbose`

**Optional** Set the verbosity of logs e.g. `-vv`. Default `"false"`.

### `on-unmatched`

**Optional** Log paths that did not match any formatters at the specified log level. Default `"info"`.

### `quiet`

**Optional** Disable all logs except errors.

### `clear-cache`

**Optional** Reset the evaluation cache; useful when you suspect the cache is stale.

### `excludes`

**Optional** Exclude files or directories matching the supplied glob patterns.
