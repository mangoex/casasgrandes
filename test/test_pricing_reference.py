import json
import unittest
from pathlib import Path

from pricing_reference import (
    PricingReferenceError,
    calculate_discount_budget,
    is_key_account_eligible,
    calculate_item_net_price,
)


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

    def test_tdd_tc_088_key_account_seed_exclusive_oracle(self) -> None:
        """TDD-TC-088: Cuenta Clave aplica a semillas/híbridos y excluye agroquímicos."""
        # 1. Validación de categorías elegibles
        self.assertTrue(is_key_account_eligible("Híbrido"))
        self.assertTrue(is_key_account_eligible("hibrido"))
        self.assertTrue(is_key_account_eligible("Semilla"))
        self.assertTrue(is_key_account_eligible("semillas"))
        self.assertFalse(is_key_account_eligible("Agroquímico"))
        self.assertFalse(is_key_account_eligible("agroquimico"))
        self.assertFalse(is_key_account_eligible("Fertilizante"))
        self.assertFalse(is_key_account_eligible(None))

        # 2. Cálculo determinista de precio neto: Híbrido (ej. Hipopótamo o Calamar)
        # Con precio base 7015 y Retener GOLD (-$100), debe descontar $100 -> 6915.00
        hibrido_neto = calculate_item_net_price(
            category="Híbrido",
            list_price=7015,
            key_account_discount=100,
        )
        self.assertEqual(hibrido_neto, "6915.00")

        # 3. Cálculo determinista de precio neto: Agroquímico (ej. Clavis + Desis)
        # Con precio base 897.19 y Retener GOLD (-$100), NO debe descontar -> 897.19
        agroquimico_neto = calculate_item_net_price(
            category="Agroquímico",
            list_price=897.19,
            key_account_discount=100,
        )
        self.assertEqual(agroquimico_neto, "897.19")


if __name__ == "__main__":
    unittest.main()
