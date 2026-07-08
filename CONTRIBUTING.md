# Contributing

## Filing Issues

Whether you find a bug, typo or an API call that could be clarified, please [file an issue](https://github.com/BarqDB/barq-js/issues) on our GitHub repository.

When filing an issue, please provide as much of the following information as possible in order to help others fix it:

1. **Goals**
2. **Expected results**
3. **Actual results**
4. **Steps to reproduce**
5. **Code sample that highlights the issue** (full Xcode / Android Studio projects that we can compile ourselves are ideal)
6. **Version of Barq / Xcode/ Android Studio/ OSX/ WIN**

If you'd like to send us sensitive sample code to help troubleshoot your issue, you can email <help@barqdb.space> directly.

## Contributing Bug Fixes and Enhancements

We love contributions to Barq! If you'd like to fix bugs, contribute code, documentation, or add any other improvements, we recommend that you either [find an existing issue](https://github.com/BarqDB/barq-js/issues?q=is%3Aopen+is%3Aissue+label%3AFirst-Good-Issue) or create a new issue to pitch what you would like to work on. Once you are ready to contribute, please [file a Pull Request](https://github.com/BarqDB/barq-js/pulls) on our GitHub repository. Make sure to accept our [CLA](#cla).

When creating a PR as an external contributor, please express your intent with your PR; what do you want to solve? To avoid duplication, please link your PR to an existing issue.

Moreover, indicate how you would like us to support you. We will happily guide you and work with you to move the PR to a point where it can be merged. It might require considerable work at your end to meet our expectations (code quality, API docs, TS defs, tests, etc.). In the case you want to move on and not work with us, please let us know. If the PR meets our expectations, we will merge it - and if it doesn't, we will either take over or close it, depending on the requirement on our time and our current priorities.

### Branching

If you’re working on a long-living branch, keep it updated with upstream changes by rebasing it on the target branch on a regular basis. This requires a force-push, so you should coordinate with anyone working on the same branch team when doing that.

### CLA

Barq welcomes all contributions! The only requirement we have is that, like many other projects, we need to have a [Contributor License Agreement](https://en.wikipedia.org/wiki/Contributor_License_Agreement) (CLA) in place before we can accept any external code. Our own CLA is a modified version of the Apache Software Foundation’s CLA.

[Please submit your CLA electronically using our Google form](https://docs.google.com/forms/d/e/1FAIpQLSeQ9ROFaTu9pyrmPhXc-dEnLD84DbLuT_-tPNZDOL9J10tOKQ/viewform) so we can accept your submissions. The GitHub username you file there will need to match that of your Pull Requests. If you have any questions or cannot file the CLA electronically, you can email <help@barqdb.space>.

## Getting started contributing

Browse the [contrib](./contrib/) directory for detailed guides on building and testing the library.

TLDR; We have an NPM workspace mono-repo, orchestrated by [Wireit](https://github.com/google/wireit).

```shell
# Clone the repository (with submodules)
git clone --recurse-submodules git@github.com:BarqDB/barq-js.git
# Change directory into the git repo
cd barq-js
# Install dependencies
npm install
# Build the SDK (generates the native binding from barq-core, then compiles it)
npm run build:node --workspace @barqdb/barq
```