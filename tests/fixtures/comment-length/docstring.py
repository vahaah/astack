"""Billing helpers.

The module docstring is a string literal, not a comment.
It can run as long as the module needs.
Tools such as pydoc and help() read it.
"""


def total(lines):
    """Sum the line amounts.

    Each line is a mapping with an amount in minor units.
    Lines with a negative amount are refunds.
    The result is never rounded.
    """
    return sum(line["amount"] for line in lines)


# The tax table is loaded once per process.
# Reloading it per request doubled the latency,
# and the table changes once a quarter.
# Restart the workers after a tax update.
TAX_TABLE = load_tax_table()
