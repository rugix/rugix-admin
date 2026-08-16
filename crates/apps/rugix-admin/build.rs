//! Injects build metadata, generates Sidex Rust types, and embeds the browser
//! application.

use std::env;
use std::error::Error;
use std::fs;
use std::io;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

fn main() -> Result<(), Box<dyn Error>> {
    println!("cargo:rerun-if-env-changed=RUGIX_ADMIN_VERSION");

    let project_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let version = resolve_version(&project_dir)?;
    println!("cargo:rustc-env=RUGIX_ADMIN_VERSION={version}");

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

/// Resolves the version injected into the Rugix Admin binary.
fn resolve_version(project_dir: &Path) -> Result<String, Box<dyn Error>> {
    match env::var("RUGIX_ADMIN_VERSION") {
        Ok(version) => validate_version(version),
        Err(env::VarError::NotPresent) => {
            let Some(revision) = git_revision(project_dir) else {
                return Ok("unknown".to_owned());
            };
            emit_git_rerun_paths(project_dir);
            Ok(format!("git-{revision}"))
        }
        Err(error) => Err(format!("failed to read RUGIX_ADMIN_VERSION: {error}").into()),
    }
}

/// Rejects values that cannot be passed through Cargo build-script output safely.
fn validate_version(version: String) -> Result<String, Box<dyn Error>> {
    if version.is_empty() {
        return Err("invalid RUGIX_ADMIN_VERSION: value must not be empty".into());
    }
    if version.contains(['\r', '\n']) {
        return Err("invalid RUGIX_ADMIN_VERSION: value must be a single line".into());
    }
    Ok(version)
}

/// Returns the shortest unique Git revision with a minimum length of eight.
fn git_revision(project_dir: &Path) -> Option<String> {
    git_output(project_dir, &["rev-parse", "--short=8", "HEAD"])
}

/// Registers Git's HEAD and current branch ref as build inputs.
fn emit_git_rerun_paths(project_dir: &Path) {
    let Some(head_path) = git_path(project_dir, "HEAD") else {
        return;
    };
    println!("cargo:rerun-if-changed={}", head_path.display());

    let head = match fs::read_to_string(&head_path) {
        Ok(head) => head,
        Err(error) => {
            println!(
                "cargo:warning=failed to watch Rugix Admin Git revision at {}: {error}",
                head_path.display()
            );
            return;
        }
    };
    let Some(reference) = head.trim().strip_prefix("ref: ") else {
        return;
    };
    if let Some(reference_path) = git_path(project_dir, reference) {
        println!("cargo:rerun-if-changed={}", reference_path.display());
    }
}

/// Resolves a path within the checkout's Git directory.
fn git_path(project_dir: &Path, path: &str) -> Option<PathBuf> {
    let path = PathBuf::from(git_output(project_dir, &["rev-parse", "--git-path", path])?);
    Some(if path.is_absolute() {
        path
    } else {
        project_dir.join(path)
    })
}

/// Runs Git in the project checkout and returns trimmed standard output.
fn git_output(project_dir: &Path, args: &[&str]) -> Option<String> {
    let output = match Command::new("git")
        .arg("-C")
        .arg(project_dir)
        .args(args)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            println!("cargo:warning=failed to read Rugix Admin Git metadata: {error}");
            return None;
        }
    };
    if !output.status.success() {
        println!(
            "cargo:warning=failed to read Rugix Admin Git metadata: Git exited with {}",
            output.status
        );
        return None;
    }

    let output = match String::from_utf8(output.stdout) {
        Ok(output) => output,
        Err(error) => {
            println!("cargo:warning=failed to decode Rugix Admin Git metadata: {error}");
            return None;
        }
    };
    let output = output.trim();
    if output.is_empty() {
        println!("cargo:warning=failed to read Rugix Admin Git metadata: output was empty");
        return None;
    }
    Some(output.to_owned())
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
