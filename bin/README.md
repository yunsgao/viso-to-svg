# Native VSD converter

The plugin looks for the `libvisio2svg` command-line converter in one of these platform folders:

```text
bin/win-x64/vsd2svg-conv.exe
bin/darwin-universal/vsd2svg-conv
bin/linux-x64/vsd2svg-conv
```

The executable must accept the upstream command-line arguments:

```text
vsd2svg-conv -i input.vsd -o output-directory
```

The Windows converter is bundled in this repository and has been verified against a Visio 2003 `.vsd` file. The macOS and Linux binaries still need to be built and added before those platforms can import VSD without a user-supplied converter path. Native binaries are platform-specific and must retain their upstream license notices when distributed.
