import json
import re
from pathlib import Path


CONFIG_DIR = Path(__file__).parent
REQUIRED_CHECKS = {
    "build",
    "integration-light",
    "lint-and-type-check",
    "security-tests",
    "unit-tests",
    "vulnerability-scan",
    "workflow-tests",
}


def select_config(paths: list[str]) -> tuple[dict[str, bool], set[str]]:
    setup = (CONFIG_DIR / "config.yml").read_text()
    mapping = re.search(
        r"mapping: &config-mapping \|\n(?P<body>(?: {12}.+\n)+)", setup
    )
    assert mapping

    parameters: dict[str, bool] = {}
    configs: set[str] = set()
    for line in mapping.group("body").splitlines():
        pattern, parameter, value, config = line.split()
        if any(re.fullmatch(pattern, path) for path in paths):
            parameters[parameter] = json.loads(value)
            configs.add(config)

    return parameters, configs or {".circleci/no-updates.yml"}


def main() -> None:
    cases = {
        "docs-only": (
            ["docs/README.md"],
            ({"always-continue": True, "docs-changed": True}, {"shared", "docs"}),
        ),
        "code-only": (
            ["src/app/page.tsx"],
            ({"always-continue": True, "code-changed": True}, {"shared", "code"}),
        ),
        "mixed": (
            ["docs/README.md", "src/app/page.tsx"],
            (
                {"always-continue": True, "docs-changed": True, "code-changed": True},
                {"shared", "docs", "code"},
            ),
        ),
        "root": (
            ["README.md"],
            ({"always-continue": True, "code-changed": True}, {"shared", "code"}),
        ),
        "config": (
            [".circleci/config.yml"],
            ({"always-continue": True, "code-changed": True}, {"shared", "code"}),
        ),
        "no-updates": ([], ({}, {"no-updates"})),
    }

    for name, (paths, (parameters, config_names)) in cases.items():
        configs = {f".circleci/{config_name}-config.yml" for config_name in config_names}
        if config_names == {"no-updates"}:
            configs = {".circleci/no-updates.yml"}
        assert select_config(paths) == (parameters, configs), name

    for config_name in ("docs-config.yml", "no-updates.yml"):
        config = (CONFIG_DIR / config_name).read_text()
        assert "type: no-op" in config
        assert set(re.findall(r"^\s+name: (.+)$", config, re.MULTILINE)) == REQUIRED_CHECKS


if __name__ == "__main__":
    main()
