#!/usr/bin/env bash
# Build the optional Store -> YouTube (Y2JB) launcher payload.
#
# Needs the PS5 payload SDK and a host LLVM 18 toolchain:
#   macOS:  brew install llvm@18
#           export LLVM_CONFIG=/opt/homebrew/opt/llvm@18/bin/llvm-config
#   Linux:  export LLVM_CONFIG=$(command -v llvm-config-18)
#
# Override the SDK with SDK=/path/to/ps5-payload-sdk (or PS5_PAYLOAD_SDK).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${LLVM_CONFIG:-}" ]]; then
    if command -v llvm-config-18 >/dev/null 2>&1; then
        LLVM_CONFIG="$(command -v llvm-config-18)"
    elif command -v llvm-config >/dev/null 2>&1; then
        LLVM_CONFIG="$(command -v llvm-config)"
    fi
fi

SDK="${SDK:-${PS5_PAYLOAD_SDK:-/opt/ps5-payload-sdk}}"

if [[ -z "${LLVM_CONFIG:-}" || ! -x "$LLVM_CONFIG" ]]; then
    echo "LLVM 18 not found. Set LLVM_CONFIG=/path/to/llvm-config" >&2
    exit 1
fi
if [[ ! -x "$SDK/bin/prospero-clang" ]]; then
    echo "PS5 payload SDK not found: $SDK" >&2
    echo "Set SDK=/path/to/ps5-payload-sdk" >&2
    exit 1
fi

make store-yt SDK="$SDK" "$@"
