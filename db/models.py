import asyncio
import aiosqlite

DB_PATH = "furniture.db"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            DROP TABLE IF EXISTS products;
        """)
        await db.execute("""
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                article TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                wood_type TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER DEFAULT 0,
                dimensions TEXT,
                description TEXT
            )
        """)
        await db.commit()
    print("✅ Таблица products создана заново")


async def add_test_products():
    async with aiosqlite.connect(DB_PATH) as db:
        products = [
            (
                "ST-001",
                "Стол обеденный из массива дуба",
                "дуб",
                "столы",
                45000,
                3,
                "200x90x75 см",
                "Классический дизайн",
            ),
            (
                "BD-002",
                "Кровать двуспальная Ясень",
                "ясень",
                "кровати",
                68000,
                2,
                "160x200 см",
                "",
            ),
            ("CH-003", "Стул барный Дуб", "дуб", "стулья", 12500, 8, "45x45x90 см", ""),
        ]

        await db.executemany(
            """
            INSERT OR IGNORE INTO products 
            (article, name, wood_type, category, price, stock, dimensions, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            products,
        )
        await db.commit()
    print("✅ Тестовые товары добавлены")

