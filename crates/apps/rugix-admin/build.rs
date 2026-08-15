//! Generates Sidex Rust types and embeds the built browser application.

use std::error::Error;
use std::fs;
use std::io;
use std::path::Path;

fn main() -> Result<(), Box<dyn Error>> {
    sidex_build_rs::configure().with_bundle(".").generate()?;

    let out_dir = std::env::var("OUT_DIR")?;
    let frontend_out = Path::new(&out_dir).join("frontend-dist");
    let frontend_dist = Path::new("../../..").join("frontend/dist");

    remove_dir_if_present(&frontend_out)?;
    fs::create_dir_all(&frontend_out)?;

    if frontend_dist.join("index.html").exists() {
        copy_dir(&frontend_dist, &frontend_out)?;
        emit_rerun_if_changed(&frontend_dist)?;
    } else {
        println!(
            "cargo:warning=rugix-admin frontend/dist is missing; embedding a minimal placeholder"
        );
        fs::write(
            frontend_out.join("index.html"),
            r#"<!doctype html><html><head><meta charset="utf-8"><title>Rugix Admin</title></head><body><h1>Rugix Admin</h1><p>The frontend has not been built. Run <code>pnpm install --frozen-lockfile</code> and <code>pnpm run build</code> in <code>frontend</code>, then rebuild <code>rugix-admin</code>.</p></body></html>"#,
        )?;
    }

    println!("cargo:rerun-if-changed=../../../frontend/dist");
    Ok(())
}

/// Removes a previous embedded frontend directory when it exists.
fn remove_dir_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Copies a directory tree into Cargo's build output.
fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_dir(&source, &target)?;
        } else {
            fs::copy(&source, &target)?;
        }
    }
    Ok(())
}

/// Registers every embedded asset as a Cargo build input.
fn emit_rerun_if_changed(path: &Path) -> io::Result<()> {
    println!("cargo:rerun-if-changed={}", path.display());
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            emit_rerun_if_changed(&entry?.path())?;
        }
    }
    Ok(())
}
