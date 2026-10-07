//! Runtime-only danmaku credentials. Never embed these in the binary or persist
//! them in settings.json.

use serde_json::{Value, json};
use std::io::Read;
use std::path::{Path, PathBuf};

fn env_path(explicit: Option<PathBuf>, cwd: &Path, config_dir: &Path) -> PathBuf {
    explicit.unwrap_or_else(|| {
        let local = cwd.join(".env");
        if local.is_file() {
            local
        } else {
            config_dir.join(".env")
        }
    })
}

fn parse(reader: impl Read) -> Result<Value, ()> {
    let mut api_url = String::new();
    let mut api_key = String::new();
    for entry in dotenvy::from_read_iter(reader) {
        // dotenvy errors can include the offending line, so never log them.
        let (key, value) = entry.map_err(|_| ())?;
        match key.as_str() {
            "DANMAKU_API_URL" => api_url = value.trim().trim_end_matches('/').to_owned(),
            "DANMAKU_API_KEY" => api_key = value,
            _ => {}
        }
    }
    if api_key.contains(['\r', '\n']) {
        return Err(());
    }
    Ok(json!({ "apiUrl": api_url, "apiKey": api_key }))
}

/// Select one file (explicit path, working-directory .env, then user config
/// directory .env). Do not merge credentials from different files or mutate
/// the process environment, which is unsafe after threads have started.
pub fn load_json(explicit: Option<PathBuf>, cwd: &Path, config_dir: &Path) -> String {
    let path = env_path(explicit, cwd, config_dir);
    let config = match std::fs::File::open(path) {
        Ok(file) => match parse(file) {
            Ok(config) => config,
            Err(()) => {
                eprintln!("[danmaku] Invalid .env; online danmaku is disabled");
                json!({})
            }
        },
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!("[danmaku] Cannot read .env; online danmaku is disabled");
            }
            json!({})
        }
    };
    jfn_js_json::to_js_json(&config).unwrap_or_else(|| "{}".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quotes_comments_crlf_and_normalizes_address() {
        let config = parse(
            b"# local config\r\nDANMAKU_API_URL='https://danmaku.example.com/'\r\nexport DANMAKU_API_KEY=\"key#with=punctuation\" # comment\r\nUNRELATED=value\r\n".as_slice(),
        ).unwrap();
        assert_eq!(config["apiUrl"], "https://danmaku.example.com");
        assert_eq!(config["apiKey"], "key#with=punctuation");
    }

    #[test]
    fn rejects_invalid_file_and_multiline_header() {
        assert!(parse(b"DANMAKU_API_KEY='unterminated".as_slice()).is_err());
        assert!(parse(b"DANMAKU_API_KEY=\"line1\\nline2\"".as_slice()).is_err());
    }

    #[test]
    fn serializes_key_as_data() {
        let config = parse(b"DANMAKU_API_KEY='a\"b\\c'".as_slice()).unwrap();
        let encoded = config.to_string();
        let decoded: Value = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded["apiKey"], "a\"b\\c");
    }

    #[test]
    fn explicit_missing_file_does_not_fall_back() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing.env");
        assert_eq!(
            env_path(Some(missing.clone()), Path::new("."), Path::new("config")),
            missing
        );
        assert_eq!(
            load_json(Some(missing), Path::new("."), Path::new("config")),
            "{}"
        );
    }

    #[test]
    fn chooses_one_file_without_merging_credentials() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().join("cwd");
        let config_dir = root.path().join("config");
        std::fs::create_dir_all(&cwd).unwrap();
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join(".env"), "DANMAKU_API_KEY=config-key").unwrap();
        let read = |explicit| {
            serde_json::from_str::<Value>(&load_json(explicit, &cwd, &config_dir)).unwrap()
        };
        assert_eq!(read(None)["apiKey"], "config-key");
        std::fs::write(cwd.join(".env"), "DANMAKU_API_URL=https://local.example").unwrap();
        let local = read(None);
        assert_eq!(local["apiUrl"], "https://local.example");
        assert_eq!(local["apiKey"], "");
        assert_eq!(read(Some(config_dir.join(".env")))["apiKey"], "config-key");
    }

    #[test]
    fn invalid_file_discards_partial_credentials() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), "DANMAKU_API_KEY=private\nBROKEN='unclosed").unwrap();
        assert_eq!(
            load_json(Some(file.path().to_owned()), Path::new("."), Path::new(".")),
            "{}"
        );
    }
}
