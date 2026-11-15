from spike.compose.compose_http import parse_event_stream


def test_each_event_is_one_json_value():
    assert parse_event_stream(b'data: "\xec\x95\x88\xeb\x85\x95"\n\ndata: {"n": 1}\n\n') == ["안녕", {"n": 1}]


def test_data_lines_of_one_event_are_joined_with_newlines():
    assert parse_event_stream(b'data: ["a",\ndata: "b"]\n\n') == [["a", "b"]]


def test_crlf_line_endings_are_accepted():
    assert parse_event_stream(b'data: 1\r\n\r\ndata: 2\r\n\r\n') == [1, 2]


def test_an_empty_body_has_no_events():
    assert parse_event_stream(b"") == []
