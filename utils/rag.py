import aiosqlite
from langchain.tools import tool

DB_PATH = "furniture.db"


@tool
async def get_product_info(query: str) -> str:
    """
    Ищет товары в базе по названию, артикулу, породе дерева или категории.
    Всегда используй этот инструмент, когда клиент спрашивает про мебель, цену или наличие.
    """
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            search_term = f"%{query.lower()}%"

            async with db.execute(
                """
                SELECT article, name, wood_type, category, price, stock, dimensions 
                FROM products 
                WHERE LOWER(name) LIKE ? 
                   OR LOWER(article) LIKE ? 
                   OR LOWER(wood_type) LIKE ? 
                   OR LOWER(category) LIKE ?
                LIMIT 5
            """,
                (search_term, search_term, search_term, search_term),
            ) as cursor:

                rows = await cursor.fetchall()

                if not rows:
                    return "К сожалению, по вашему запросу ничего не найдено. Уточните, пожалуйста."

                result = []
                for row in rows:
                    article, name, wood, category, price, stock, dimensions = row
                    result.append(
                        f"✅ **{name}**\n"
                        f"Артикул: {article}\n"
                        f"Материал: {wood.capitalize()}\n"
                        f"Цена: **{price:,.0f} ₽**\n"
                        f"В наличии: {stock} шт.\n"
                        f"Размеры: {dimensions or 'уточняем'}\n"
                    )
                return "\n".join(result)

    except Exception as e:
        print(f"Ошибка в get_product_info: {e}")
        return "Извините, произошла ошибка при поиске товара."

