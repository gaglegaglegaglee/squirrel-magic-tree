#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_dir="$project_dir/dist"

rm -rf -- "$output_dir"
mkdir -p -- "$output_dir/src"
cp -- "$project_dir/index.html" "$project_dir/styles.css" "$output_dir/"
cp -- \
  "$project_dir/src/app.js" \
  "$project_dir/src/game-controller.js" \
  "$project_dir/src/game-state.js" \
  "$project_dir/src/record-store.js" \
  "$project_dir/src/tutorial-store.js" \
  "$output_dir/src/"
