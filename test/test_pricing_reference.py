import json
import unittest
from pathlib import Path

from pricing_reference import PricingReferenceError, calculate_discount_budget


FIXTURES = Path(__file__).parent / "fixtures" / "pricing_discount_budget.json"


class PricingReferenceTest(unittest.TestCase):
    def test_shared_golden_cases(self) -> None:
        cases = json.loads(FIXTURES.read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                if "error" in case:
                    with self.assertRaises(PricingReferenceError) as captured:
                        calculate_discount_budget(**case["input"])
                    self.assertEqual(captured.exception.code, case["error"])
                else:
                    self.assertEqual(
                        calculate_discount_budget(**case["input"]),
                        case["expected"],
                    )


if __name__ == "__main__":
    unittest.main()
