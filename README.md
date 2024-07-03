# Treefmt GitHub Action

This action installs and runs `treefmt` on your repository.

Currently, if you run this action on a Windows-based runner, it will use the older `treefmt` version 0.6.1.
This is because the newer versions of `treefmt` are not yet supported on Windows.

I would recommend using a Linux-based runner if you want to use the latest version of `treefmt`.
I doubt you will need to run this action on Windows anyway, as it is intended for CI/CD pipelines.

## Inputs

### `version`

**Optional** The version of `treefmt` to install. Default `"latest"`.

### `github_token`

**Required** GitHub token for accessing the API.

### `config_file`

**Optional** Path to the `treefmt` configuration file. Default `"treefmt.toml"`.

### `allow_missing_formatter`

**Optional** Do not exit with error if a configured formatter is missing. Default `"false"`.

### `working_directory`

**Optional** Run as if `treefmt` was started in the specified working directory instead of the current working directory. Default `"."`.

### `no_cache`

**Optional** Ignore the evaluation cache entirely. Useful for CI. Default `"false"`.

### `fail_on_change`

**Optional** Exit with error if any changes were made. Useful for CI. Default `"false"`.

### `formatters`

**Optional** Specify formatters to apply. Defaults to all formatters.

### `tree_root`

**Optional** The root directory from which `treefmt` will start walking the filesystem.

### `tree_root_file`

**Optional** File to search for to find the project root (if `--tree_root` is not passed).

### `walk`

**Optional** The method used to traverse the files within `--tree_root`. Supports 'auto', 'git' or 'filesystem'. Default `"auto"`.

### `verbose`

**Optional** Set the verbosity of logs e.g. `-vv`. Default `"false"`.

### `on_unmatched`

**Optional** Log paths that did not match any formatters at the specified log level. Default `"warn"`.

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
      uses: isbecker/treefmt-action@v1
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        version: 'latest'
        fail_on_change: 'true'
