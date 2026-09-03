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
        """TDD-TC-088: Cuenta Clave aplica exclusivamente a Calamar e Hipopótamo."""
        # 1. Validación de productos elegibles (Calamar e Hipopótamo)
        self.assertTrue(is_key_account_eligible("Híbrido", "Hipopótamo Acceleron"))
        self.assertTrue(is_key_account_eligible("hibrido", "HIPOPOTAMO ACCEL"))
        self.assertTrue(is_key_account_eligible("Semilla", "Calamar"))
        self.assertTrue(is_key_account_eligible("semillas", "semilla calamar"))

        # 2. Validación de productos no elegibles (otras semillas, agroquímicos, fertilizantes)
        self.assertFalse(is_key_account_eligible("Híbrido", "Rinoceronte Acceleron"))
        self.assertFalse(is_key_account_eligible("Híbrido", "Armadillo Poncho"))
        self.assertFalse(is_key_account_eligible("Híbrido", "Vitala"))
        self.assertFalse(is_key_account_eligible("Híbrido", "A-7573 Acceleron"))
        self.assertFalse(is_key_account_eligible("Agroquímico", "Clavis + Desis"))
        self.assertFalse(is_key_account_eligible("Fertilizante", "Urea"))
        self.assertFalse(is_key_account_eligible(None, "Calamar"))
        self.assertFalse(is_key_account_eligible("Híbrido", None))

        # 3. Cálculo determinista: Hipopótamo y Calamar aplican descuento de Cuenta Clave (-$100)
        hipopotamo_neto = calculate_item_net_price(
            category="Híbrido",
            product_name="Hipopótamo Acceleron",
            list_price=7015,
            key_account_discount=100,
        )
        self.assertEqual(hipopotamo_neto, "6915.00")

        calamar_neto = calculate_item_net_price(
            category="Semilla",
            product_name="Calamar",
            list_price=7015,
            key_account_discount=100,
        )
        self.assertEqual(calamar_neto, "6915.00")

        # 4. Cálculo determinista: Otra semilla (ej. Rinoceronte) NO aplica descuento ($0)
        rinoceronte_neto = calculate_item_net_price(
            category="Híbrido",
            product_name="Rinoceronte Acceleron",
            list_price=5300,
            key_account_discount=100,
        )
        self.assertEqual(rinoceronte_neto, "5300.00")

        # 5. Cálculo determinista: Agroquímico (ej. Clavis) NO aplica descuento ($0)
        agroquimico_neto = calculate_item_net_price(
            category="Agroquímico",
            product_name="Clavis + Desis",
            list_price=897.19,
            key_account_discount=100,
        )
        self.assertEqual(agroquimico_neto, "897.19")


if __name__ == "__main__":
    unittest.main()
