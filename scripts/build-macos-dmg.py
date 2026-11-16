import argparse
from pathlib import Path

from dmgbuild import build_dmg


def main():
    parser = argparse.ArgumentParser(description="Package a Lutri app in the branded macOS disk image.")
    parser.add_argument("app", type=Path, help="Path to the bundled Lutri.app")
    parser.add_argument("output", type=Path, help="Path to the output .dmg")
    args = parser.parse_args()

    if args.app.suffix != ".app" or not (args.app / "Contents/Info.plist").is_file():
        parser.error(f"Invalid macOS app bundle: {args.app}")
    if args.output.suffix != ".dmg":
        parser.error("The output path must end in .dmg")

    src_tauri = Path(__file__).resolve().parents[1] / "src-tauri"
    app = args.app.absolute()
    output = args.output.absolute()
    output.parent.mkdir(parents=True, exist_ok=True)

    build_dmg(
        filename=str(output),
        volume_name=app.stem,
        settings={
            "format": "UDZO",
            "filesystem": "APFS",
            "files": [str(app)],
            "symlinks": {"Applications": "/Applications"},
            "hide_extensions": [app.name],
            "icon": str(src_tauri / "icons/icon.icns"),
            "background": str(src_tauri / "macos/installer-background.png"),
            "window_rect": ((150, 150), (640, 350)),
            "icon_locations": {app.name: (185, 225), "Applications": (455, 225)},
            "icon_size": 88,
            "text_size": 13,
        },
    )


if __name__ == "__main__":
    main()
