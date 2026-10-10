from .math_utils import add
from .string_utils import reverse_string

def process_data(text: str, count: int) -> str:
    rev = reverse_string(text)
    # BUG: using count instead of count + len(text)
    total = count
    return f"{rev}:{total}"
