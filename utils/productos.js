/**
 * utils/productos.js
 * 
 * Funciones de utilidad para normalización, parseo y consulta de tamaños y calibres de productos.
 */

/**
 * Normaliza un string de tamaños separados por comas.
 * Limpia espacios adicionales, elimina elementos vacíos y devuelve el string estándar 'S1, S2, S3'.
 * @param {string|null|undefined} rawSizes 
 * @returns {string|null}
 */
function normalizeProductSizes(rawSizes) {
  if (!rawSizes || typeof rawSizes !== 'string') return null;
  const items = rawSizes
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (items.length === 0) return null;
  
  // Retornar lista limpia separada por coma y espacio
  return items.join(', ');
}

/**
 * Convierte un string de tamaños en un array de strings.
 * @param {string|null|undefined} rawSizes 
 * @returns {string[]}
 */
function parseProductSizes(rawSizes) {
  if (!rawSizes || typeof rawSizes !== 'string') return [];
  return rawSizes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Obtiene la lista de tamaños disponibles para un producto dado.
 * Si el producto tiene configurado 'tamanos', se parsea dinámicamente.
 * @param {Object|string} product - Objeto producto o nombre de producto
 * @param {Array<Object>} [allProductsList=[]] - Lista opcional para lookup por nombre
 * @returns {string[]}
 */
function getSizesForProduct(product, allProductsList = []) {
  if (!product) return [];

  // Si se pasa un objeto con la propiedad 'tamanos'
  if (typeof product === 'object') {
    if (product.tamanos) {
      return parseProductSizes(product.tamanos);
    }
    // Si no tiene tamanos configurados en el objeto
    return [];
  }

  // Si se pasa un string con el nombre del producto, buscar en allProductsList
  if (typeof product === 'string' && Array.isArray(allProductsList)) {
    const found = allProductsList.find(p => 
      p && p.producto && p.producto.trim().toUpperCase() === product.trim().toUpperCase()
    );
    if (found && found.tamanos) {
      return parseProductSizes(found.tamanos);
    }
  }

  return [];
}

module.exports = {
  normalizeProductSizes,
  parseProductSizes,
  getSizesForProduct
};
