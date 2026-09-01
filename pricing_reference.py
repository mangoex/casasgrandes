"""Oráculo no productivo para CHG-009.

El runtime HTTP permanece en JavaScript. Este módulo usa Decimal para fijar
casos dorados reproducibles y evitar que dos implementaciones definan reglas
distintas sin que las pruebas lo detecten.
"""

from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.0001")


class PricingReferenceError(ValueError):
    """Error de dominio con código estable para fixtures compartidos."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def money(value: object) -> Decimal:
    amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    if amount < 0:
        raise PricingReferenceError("invalid_pricing_amount")
    return amount


def calculate_discount_budget(
    *,
    catalog_price: object,
    monthly_price: object,
    promo_money: object = "0",
    promo_percent: object = "0",
) -> dict[str, str]:
    catalog = money(catalog_price)
    monthly = money(monthly_price)
    promotion_money = money(promo_money)
    promotion_percent = Decimal(str(promo_percent)).quantize(
        PERCENT_QUANTUM,
        rounding=ROUND_HALF_UP,
    )

    if promotion_percent < 0 or promotion_percent > 100:
        raise PricingReferenceError("invalid_promotion_percent")
    percent_cap = (catalog * promotion_percent / Decimal("100")).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )
    if promotion_money > 0 and promotion_percent > 0 and promotion_money != percent_cap:
        raise PricingReferenceError("inconsistent_monthly_promotion")

    promotion_cap = promotion_money if promotion_money > 0 else percent_cap

    embedded_discount = max(catalog - monthly, Decimal("0.00"))
    # La diferencia contra catálogo es informativa. La cotización inicia en el
    # precio mensual y puede aplicar el tope mensual completo.
    available = promotion_cap
    return {
        "catalog_price": f"{catalog:.2f}",
        "monthly_price": f"{monthly:.2f}",
        "embedded_discount": f"{embedded_discount:.2f}",
        "total_promotion_cap": f"{promotion_cap:.2f}",
        "advisor_discount_available": f"{available:.2f}",
    }
