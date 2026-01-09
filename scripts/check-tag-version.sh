#!/bin/bash
# Pre-push hook to verify tag version matches manifest.json

set -e

MANIFEST="extension/manifest.json"

# Read refs being pushed from stdin
while read -r local_ref local_sha remote_ref remote_sha; do
    # Only check tag pushes
    if [[ "$remote_ref" == refs/tags/* ]]; then
        tag="${remote_ref#refs/tags/}"

        # Get version from manifest.json
        manifest_version=$(grep -Po '"version":\s*"\K[^"]+' "$MANIFEST")

        if [[ "$tag" != "$manifest_version" ]]; then
            echo "ERROR: Tag '$tag' doesn't match manifest.json version '$manifest_version'"
            echo ""
            echo "To fix, either:"
            echo "  1. Update manifest.json version to '$tag'"
            echo "  2. Delete tag and create correct one:"
            echo "     git tag -d $tag"
            echo "     git tag $manifest_version"
            exit 1
        fi

        echo "Version check passed: $tag"
    fi
done

exit 0
