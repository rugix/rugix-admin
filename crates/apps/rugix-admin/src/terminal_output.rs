//! Terminal-output normalization for API diagnostics and streamed job logs.
//!
//! The helpers in this module turn untrusted subprocess output into plain text by
//! decoding malformed UTF-8 lossily and removing terminal escape sequences and
//! control characters before the text is stored or sent to a browser.

use std::iter::Peekable;

/// Converts subprocess bytes to safe, displayable plain text.
pub(crate) fn sanitize_terminal_bytes(input: &[u8]) -> String {
    sanitize_terminal_text(&String::from_utf8_lossy(input))
}

/// Removes terminal escape sequences and unsafe control characters from text.
pub(crate) fn sanitize_terminal_text(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '\u{001b}' => consume_escape_sequence(&mut chars),
            '\u{0090}' | '\u{0098}' | '\u{009e}' | '\u{009f}' => {
                consume_control_string(&mut chars, false);
            }
            '\u{009b}' => consume_csi_sequence(&mut chars),
            '\u{009d}' => consume_control_string(&mut chars, true),
            '\t' | '\n' => output.push(ch),
            _ if ch.is_control() => {}
            _ => output.push(ch),
        }
    }

    output
}

/// Consumes a seven-bit escape sequence after its ESC introducer.
fn consume_escape_sequence<I>(chars: &mut Peekable<I>)
where
    I: Iterator<Item = char>,
{
    let Some(ch) = chars.next() else {
        return;
    };

    match ch {
        '[' => consume_csi_sequence(chars),
        ']' => consume_control_string(chars, true),
        'P' | 'X' | '^' | '_' => consume_control_string(chars, false),
        '\u{20}'..='\u{2f}' => {
            while matches!(chars.peek(), Some('\u{20}'..='\u{2f}')) {
                chars.next();
            }
            chars.next();
        }
        _ => {}
    }
}

/// Consumes a control-sequence-introducer sequence through its final byte.
fn consume_csi_sequence<I>(chars: &mut Peekable<I>)
where
    I: Iterator<Item = char>,
{
    while let Some(ch) = chars.next() {
        if matches!(ch, '\u{40}'..='\u{7e}' | '\u{009c}') {
            break;
        }
        if ch == '\u{001b}' {
            consume_escape_sequence(chars);
            break;
        }
    }
}

/// Consumes an OSC/DCS/SOS/PM/APC string through BEL or string terminator.
fn consume_control_string<I>(chars: &mut Peekable<I>, bell_terminates: bool)
where
    I: Iterator<Item = char>,
{
    while let Some(ch) = chars.next() {
        if ch == '\u{009c}' || (bell_terminates && ch == '\u{0007}') {
            break;
        }
        if ch == '\u{001b}' && chars.peek().copied() == Some('\\') {
            chars.next();
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that seven- and eight-bit CSI styling never reaches displayed text.
    #[test]
    fn strips_csi_sequences() {
        assert_eq!(
            sanitize_terminal_text("\u{001b}[31mred\u{001b}[0m and \u{009b}1mbold\u{009b}0m"),
            "red and bold"
        );
    }

    /// Verifies that terminal titles and hyperlink metadata are removed without their
    /// labels.
    #[test]
    fn strips_control_strings() {
        assert_eq!(
            sanitize_terminal_text(
                "\u{001b}]0;window title\u{0007}open \u{001b}]8;;https://example.com\u{001b}\\link\u{001b}]8;;\u{001b}\\"
            ),
            "open link"
        );
    }

    /// Verifies that useful line formatting survives while terminal controls do not.
    #[test]
    fn filters_controls_but_preserves_tabs_and_newlines() {
        assert_eq!(
            sanitize_terminal_text("a\u{0000}b\u{0008}c\tline\n\u{001b}(Bdone\u{007f}"),
            "abc\tline\ndone"
        );
    }

    /// Verifies that malformed subprocess output remains visible without aborting a
    /// reader.
    #[test]
    fn decodes_invalid_utf8_lossily() {
        assert_eq!(
            sanitize_terminal_bytes(b"valid \xff output"),
            "valid \u{fffd} output"
        );
    }
}
