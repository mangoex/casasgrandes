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
    promotion_cap: object | None = None,
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

    represented_discount = promotion_money if promotion_money > 0 else percent_cap
    promotion_cap = money(represented_discount if promotion_cap is None else promotion_cap)
    if promotion_cap > catalog:
        raise PricingReferenceError("promotion_cap_exceeds_catalog_price")

    embedded_discount = max(catalog - monthly, Decimal("0.00"))
    if represented_discount != embedded_discount:
        raise PricingReferenceError("inconsistent_monthly_price_discount")
    if embedded_discount > promotion_cap:
        raise PricingReferenceError("monthly_discount_exceeds_promotion_cap")

    available = promotion_cap - embedded_discount
    return {
        "catalog_price": f"{catalog:.2f}",
        "monthly_price": f"{monthly:.2f}",
        "embedded_discount": f"{embedded_discount:.2f}",
        "total_promotion_cap": f"{promotion_cap:.2f}",
        "advisor_discount_available": f"{available:.2f}",
    }


import unicodedata


def normalize_text(text: str | None) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text).strip().lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def is_key_account_eligible(category: str | None, product_name: str | None = None) -> bool:
    """Valida si un producto es elegible para descuento de Cuenta Clave.

    El beneficio de Cuenta Clave es exclusivo para las semillas Calamar e Hipopótamo
    (categorías Híbrido o Semilla). No aplica a otras variedades de semillas ni a
    Agroquímicos o Fertilizantes.
    """
    if not category:
        return False
    norm_cat = normalize_text(category)
    if norm_cat not in ("hibrido", "semilla", "semillas"):
        return False
    if not product_name:
        return False
    norm_name = normalize_text(product_name)
    return "calamar" in norm_name or "hipopotamo" in norm_name


def calculate_item_net_price(
    *,
    category: str | None,
    product_name: str | None = None,
    list_price: object,
    key_account_discount: object = "0",
    chemical_discount: object = "0",
) -> str:
    """Calcula deterministamente el precio neto de una partida antes del descuento del asesor."""
    base = money(list_price)
    chem_discount = money(chemical_discount)
    cc_discount = money(key_account_discount)

    if is_key_account_eligible(category, product_name):
        effective_cc = cc_discount
        price_before_cc = base
    else:
        effective_cc = Decimal("0.00")
        price_before_cc = max(base - chem_discount, Decimal("0.00"))

    net_price = max(price_before_cc - effective_cc, Decimal("0.00"))
    return f"{net_price:.2f}"
