from python_pkg.core import process_data

def test_process_data():
    assert process_data("abc", 5) == "cba:8"
