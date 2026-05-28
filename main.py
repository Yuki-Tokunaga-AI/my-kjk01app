import copy
import hashlib
import json
import sqlite3
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR / "app"
DB_PATH = BASE_DIR / "members.db"
CATALOG_PATH = APP_DIR / "data" / "mock-data.json"
REPORTS_PATH = APP_DIR / "data" / "sample-reports.json"
HOST = "127.0.0.1"
PORT = 8000

ADMIN_ID = "admin-blg-20260428"
ADMIN_PASSWORD = "BLG-Admin-4287"
MEMBER_LOGIN_EMAIL = "kjktest1@gmail.com"
MEMBER_LOGIN_PASSWORD = "kjktest1"

FOLLOW_REWARD_POINTS = 10
PASS_REWARD_POINTS = 80
PRODUCT_REWARD_POINTS = 30


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def get_catalog():
    return load_json(CATALOG_PATH)


def get_reports():
    return load_json(REPORTS_PATH)


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def timestamp():
    return datetime.now().isoformat(timespec="seconds")


def ensure_test_login_member(connection):
    password_hash = hashlib.sha256(MEMBER_LOGIN_PASSWORD.encode("utf-8")).hexdigest()
    existing_row = connection.execute(
        "SELECT id FROM members WHERE lower(email) = ?",
        (MEMBER_LOGIN_EMAIL,),
    ).fetchone()

    if existing_row:
        connection.execute(
            "UPDATE members SET password_hash = ? WHERE id = ?",
            (password_hash, existing_row["id"]),
        )
        return

    connection.execute(
        """
        INSERT INTO members (
            name, email, password_hash, favorite_team, birthdate, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            "KJK Test User",
            MEMBER_LOGIN_EMAIL,
            password_hash,
            "KJK Demo",
            "2000-01-01",
            timestamp(),
        ),
    )


def add_column_if_missing(connection, table_name, column_name, definition):
    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()}
    if column_name not in columns:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def init_db():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                favorite_team TEXT NOT NULL,
                birthdate TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS player_follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                player_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, player_id)
            );

            CREATE TABLE IF NOT EXISTS mission_completions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                mission_id TEXT NOT NULL,
                note TEXT,
                reward_points INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, mission_id)
            );

            CREATE TABLE IF NOT EXISTS mission_photo_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                mission_id TEXT NOT NULL,
                caption TEXT NOT NULL,
                image_name TEXT NOT NULL,
                image_data_url TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, mission_id)
            );

            CREATE TABLE IF NOT EXISTS pass_purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                pass_id TEXT NOT NULL,
                price INTEGER NOT NULL,
                plan_type TEXT NOT NULL DEFAULT '',
                support_purpose TEXT NOT NULL DEFAULT '',
                reward_points INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, pass_id)
            );

            CREATE TABLE IF NOT EXISTS product_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                price INTEGER NOT NULL,
                reward_points INTEGER NOT NULL,
                billing_name TEXT NOT NULL,
                payment_brand TEXT NOT NULL,
                card_last4 TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, product_id)
            );

            CREATE TABLE IF NOT EXISTS board_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL,
                author_name TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        add_column_if_missing(connection, "members", "favorite_player_id", "TEXT")
        add_column_if_missing(connection, "pass_purchases", "plan_type", "TEXT NOT NULL DEFAULT ''")
        add_column_if_missing(connection, "pass_purchases", "support_purpose", "TEXT NOT NULL DEFAULT ''")
        connection.execute(
            """
            UPDATE members
            SET favorite_player_id = NULL
            WHERE favorite_player_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM player_follows
                  WHERE player_follows.member_id = members.id
                    AND player_follows.player_id = members.favorite_player_id
              )
            """
        )
        ensure_test_login_member(connection)


def serialize_member(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "favoriteTeam": row["favorite_team"],
        "favoritePlayerId": row["favorite_player_id"],
        "birthdate": row["birthdate"],
        "createdAt": row["created_at"],
    }


def serialize_member_auth(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "favorite_team": row["favorite_team"],
        "favorite_player_id": row["favorite_player_id"],
        "birthdate": row["birthdate"],
        "created_at": row["created_at"],
    }


def get_member(connection, member_id):
    row = connection.execute(
        """
        SELECT id, name, email, favorite_team, favorite_player_id, birthdate, created_at
        FROM members
        WHERE id = ?
        """,
        (member_id,),
    ).fetchone()
    if not row:
        raise ValueError("会員が見つかりません。")
    return row


def get_catalog_item(collection_name, item_id):
    for item in get_catalog().get(collection_name, []):
        if item.get("id") == item_id:
            return item
    raise ValueError("対象データが見つかりません。")


def get_report(report_id):
    for report in get_reports():
        if report.get("id") == report_id:
            return report
    raise ValueError("レポートが見つかりません。")


def detect_card_brand(card_number):
    if card_number.startswith("4"):
        return "VISA"
    if any(card_number.startswith(prefix) for prefix in ["51", "52", "53", "54", "55"]):
        return "Mastercard"
    if card_number.startswith(("34", "37")):
        return "AMEX"
    return "CARD"


def rank_info(points):
    tiers = [
        {"threshold": 0, "label": "Rank 0 Rookie Scout"},
        {"threshold": 100, "label": "Rank 1 Rising Booster"},
        {"threshold": 250, "label": "Rank 2 Game Changer"},
        {"threshold": 500, "label": "Rank 3 All-Star Backer"},
        {"threshold": 800, "label": "Rank 4 Franchise Icon"},
    ]
    current = tiers[0]
    next_tier = None
    for tier in tiers:
        if points >= tier["threshold"]:
            current = tier
        elif next_tier is None:
            next_tier = tier
    if next_tier:
        return {
            "label": current["label"],
            "nextUnlock": f"あと{next_tier['threshold'] - points}ptで {next_tier['label']}",
        }
    return {
        "label": current["label"],
        "nextUnlock": "最高ランクに到達しています",
    }


def build_member_state(member_id):
    catalog = get_catalog()
    data = copy.deepcopy(catalog)
    reports = get_reports()

    with get_connection() as connection:
        member_row = get_member(connection, member_id)
        follow_rows = connection.execute(
            "SELECT player_id, created_at FROM player_follows WHERE member_id = ? ORDER BY created_at DESC",
            (member_id,),
        ).fetchall()
        mission_rows = connection.execute(
            """
            SELECT mission_id, note, reward_points, created_at
            FROM mission_completions
            WHERE member_id = ?
            ORDER BY created_at DESC
            """,
            (member_id,),
        ).fetchall()
        photo_rows = connection.execute(
            """
            SELECT mission_id, caption, image_name, image_data_url, created_at
            FROM mission_photo_posts
            WHERE member_id = ?
            ORDER BY created_at DESC
            """,
            (member_id,),
        ).fetchall()
        pass_rows = connection.execute(
            """
            SELECT pass_id, price, plan_type, support_purpose, reward_points, created_at
            FROM pass_purchases
            WHERE member_id = ?
            ORDER BY created_at DESC
            """,
            (member_id,),
        ).fetchall()
        order_rows = connection.execute(
            """
            SELECT product_id, price, reward_points, billing_name, payment_brand, card_last4, created_at
            FROM product_orders
            WHERE member_id = ?
            ORDER BY created_at DESC
            """,
            (member_id,),
        ).fetchall()
        board_rows = connection.execute(
            """
            SELECT id, member_id, author_name, category, title, body, created_at
            FROM board_posts
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
        all_pass_counts = {
            row["pass_id"]: row["count"]
            for row in connection.execute(
                "SELECT pass_id, COUNT(*) AS count FROM pass_purchases GROUP BY pass_id"
            ).fetchall()
        }

    followed_ids = {row["player_id"] for row in follow_rows}
    completed_map = {row["mission_id"]: row for row in mission_rows}
    photo_map = {row["mission_id"]: row for row in photo_rows}
    purchased_pass_ids = {row["pass_id"] for row in pass_rows}
    purchased_product_ids = {row["product_id"] for row in order_rows}

    for player in data.get("players", []):
        player["isFollowed"] = player["id"] in followed_ids

    for mission in data.get("missions", []):
        mission_row = completed_map.get(mission["id"])
        mission["status"] = "達成済み" if mission_row else "未達成"
        mission["completedAt"] = mission_row["created_at"] if mission_row else None
        mission["note"] = mission_row["note"] if mission_row else ""
        if mission.get("kind") == "photo":
            photo_row = photo_map.get(mission["id"])
            mission["photo"] = (
                {
                    "caption": photo_row["caption"],
                    "imageName": photo_row["image_name"],
                    "imageDataUrl": photo_row["image_data_url"],
                    "createdAt": photo_row["created_at"],
                }
                if photo_row
                else None
            )

    order_summary = []
    for pass_item in data.get("passes", []):
        sold_count = all_pass_counts.get(pass_item["id"], 0)
        pass_item["remainingSlots"] = max(int(pass_item.get("slots", 0)) - sold_count, 0)
        pass_item["isPurchased"] = pass_item["id"] in purchased_pass_ids

    for product in data.get("products", []):
        product["isPurchased"] = product["id"] in purchased_product_ids
        order_row = next((row for row in order_rows if row["product_id"] == product["id"]), None)
        if order_row:
            order_summary.append(
                {
                    "productId": product["id"],
                    "productName": product["name"],
                    "billingName": order_row["billing_name"],
                    "paymentBrand": order_row["payment_brand"],
                    "cardLast4": order_row["card_last4"],
                    "createdAt": order_row["created_at"],
                    "price": order_row["price"],
                }
            )

    dynamic_history = []
    for row in follow_rows:
        try:
            player = get_catalog_item("players", row["player_id"])
            label = f"{player['name']} の応援を開始"
        except ValueError:
            label = f"{row['player_id']} の応援を開始"
        dynamic_history.append(
            {
                "date": row["created_at"][:10],
                "createdAt": row["created_at"],
                "label": label,
                "points": FOLLOW_REWARD_POINTS,
                "tag": "TRACK",
            }
        )
    for row in mission_rows:
        try:
            mission = get_catalog_item("missions", row["mission_id"])
            label = mission["title"]
        except ValueError:
            label = row["mission_id"]
        dynamic_history.append(
            {
                "date": row["created_at"][:10],
                "createdAt": row["created_at"],
                "label": label,
                "points": row["reward_points"],
                "tag": "QUEST",
            }
        )
    for row in pass_rows:
        try:
            pass_item = get_catalog_item("passes", row["pass_id"])
            label = f"{pass_item['title']} を購入 ({row['plan_type'] or 'support'})"
        except ValueError:
            label = f"{row['pass_id']} を購入"
        dynamic_history.append(
            {
                "date": row["created_at"][:10],
                "createdAt": row["created_at"],
                "label": label,
                "points": row["reward_points"],
                "tag": "BOOST",
            }
        )
    for row in order_rows:
        try:
            product = get_catalog_item("products", row["product_id"])
            label = f"{product['name']} を購入"
        except ValueError:
            label = f"{row['product_id']} を購入"
        dynamic_history.append(
            {
                "date": row["created_at"][:10],
                "createdAt": row["created_at"],
                "label": label,
                "points": row["reward_points"],
                "tag": "SHOP",
            }
        )

    dynamic_history.sort(key=lambda item: item["createdAt"], reverse=True)
    for item in dynamic_history:
        item.pop("createdAt", None)

    points = sum(item["points"] for item in dynamic_history)
    rank = rank_info(points)
    data["ledger"]["supportPoints"] = points
    data["ledger"]["rank"] = rank["label"]
    data["ledger"]["nextUnlock"] = rank["nextUnlock"]
    data["ledger"]["history"] = dynamic_history

    member_photo_posts = [
        {
            "missionId": row["mission_id"],
            "caption": row["caption"],
            "imageName": row["image_name"],
            "imageDataUrl": row["image_data_url"],
            "createdAt": row["created_at"],
        }
        for row in photo_rows
    ]

    return {
        "member": serialize_member(member_row),
        "data": data,
        "reports": reports,
        "orders": order_summary,
        "photoPosts": member_photo_posts,
        "boardPosts": [
            {
                "id": row["id"],
                "memberId": row["member_id"],
                "authorName": row["author_name"],
                "category": row["category"],
                "title": row["title"],
                "body": row["body"],
                "createdAt": row["created_at"],
                "isMine": row["member_id"] == member_id,
            }
            for row in board_rows
        ],
    }


def build_admin_state():
    catalog = get_catalog()
    players = {item["id"]: item for item in catalog.get("players", [])}
    missions = {item["id"]: item for item in catalog.get("missions", [])}
    products = {item["id"]: item for item in catalog.get("products", [])}

    with get_connection() as connection:
        member_rows = connection.execute(
            """
            SELECT id, name, email, favorite_team, favorite_player_id, birthdate, created_at
            FROM members
            ORDER BY id DESC
            """
        ).fetchall()
        mission_rows = connection.execute(
            """
            SELECT mc.member_id, mc.mission_id, mc.note, mc.reward_points, mc.created_at, m.name AS member_name
            FROM mission_completions mc
            JOIN members m ON m.id = mc.member_id
            ORDER BY mc.created_at DESC
            """
        ).fetchall()
        photo_rows = connection.execute(
            """
            SELECT mp.member_id, mp.mission_id, mp.caption, mp.image_name, mp.image_data_url, mp.created_at, m.name AS member_name
            FROM mission_photo_posts mp
            JOIN members m ON m.id = mp.member_id
            ORDER BY mp.created_at DESC
            """
        ).fetchall()
        order_rows = connection.execute(
            """
            SELECT po.member_id, po.product_id, po.price, po.billing_name, po.payment_brand, po.card_last4, po.created_at, m.name AS member_name
            FROM product_orders po
            JOIN members m ON m.id = po.member_id
            ORDER BY po.created_at DESC
            """
        ).fetchall()

    return {
        "metrics": {
            "memberCount": len(member_rows),
            "missionCount": len(mission_rows),
            "photoCount": len(photo_rows),
            "orderCount": len(order_rows),
        },
        "members": [
            {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "favoriteTeam": row["favorite_team"],
                "favoritePlayerName": players.get(row["favorite_player_id"], {}).get("name", "未設定"),
                "createdAt": row["created_at"],
            }
            for row in member_rows
        ],
        "missions": [
            {
                "memberName": row["member_name"],
                "missionTitle": missions.get(row["mission_id"], {}).get("title", row["mission_id"]),
                "note": row["note"],
                "rewardPoints": row["reward_points"],
                "createdAt": row["created_at"],
            }
            for row in mission_rows
        ],
        "photos": [
            {
                "memberName": row["member_name"],
                "missionTitle": missions.get(row["mission_id"], {}).get("title", row["mission_id"]),
                "caption": row["caption"],
                "imageName": row["image_name"],
                "imageDataUrl": row["image_data_url"],
                "createdAt": row["created_at"],
            }
            for row in photo_rows
        ],
        "orders": [
            {
                "memberName": row["member_name"],
                "productName": products.get(row["product_id"], {}).get("name", row["product_id"]),
                "price": row["price"],
                "billingName": row["billing_name"],
                "paymentBrand": row["payment_brand"],
                "cardLast4": row["card_last4"],
                "createdAt": row["created_at"],
            }
            for row in order_rows
        ],
    }


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/public-data":
            self.handle_public_data()
            return
        if parsed.path == "/api/app-state":
            self.handle_app_state(parsed.query)
            return
        if parsed.path == "/api/admin/state":
            self.handle_admin_state(parsed.query)
            return
        if parsed.path == "/api/health":
            self.send_json({"status": "ok"})
            return

        self.path = parsed.path
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/register":
            self.handle_register()
            return
        if parsed.path == "/api/login":
            self.handle_login()
            return
        if parsed.path == "/api/admin/login":
            self.handle_admin_login()
            return
        if parsed.path == "/api/follow-player":
            self.handle_follow_player()
            return
        if parsed.path == "/api/set-favorite-player":
            self.handle_set_favorite_player()
            return
        if parsed.path == "/api/complete-mission":
            self.handle_complete_mission()
            return
        if parsed.path == "/api/board-post":
            self.handle_board_post()
            return
        if parsed.path == "/api/purchase-pass":
            self.handle_purchase_pass()
            return
        if parsed.path == "/api/checkout-product":
            self.handle_checkout_product()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("JSON形式が不正です。") from error

    def handle_public_data(self):
        catalog = get_catalog()
        self.send_json(
            {
                "clubs": catalog.get("clubs", []),
                "players": catalog.get("players", []),
                "reports": get_reports(),
            }
        )

    def handle_app_state(self, query):
        member_ids = parse_qs(query).get("memberId", [])
        if not member_ids:
            self.send_json({"error": "memberId が必要です。"}, status=HTTPStatus.BAD_REQUEST)
            return
        try:
            payload = build_member_state(int(member_ids[0]))
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return
        self.send_json(payload)

    def handle_admin_state(self, query):
        admin_ids = parse_qs(query).get("adminId", [])
        if not admin_ids or admin_ids[0] != ADMIN_ID:
            self.send_json({"error": "管理者認証が必要です。"}, status=HTTPStatus.UNAUTHORIZED)
            return
        self.send_json(build_admin_state())

    def handle_register(self):
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", "")).strip()
        favorite_team = str(payload.get("favoriteTeam", "")).strip()
        birthdate = str(payload.get("birthdate", "")).strip()

        if not all([name, email, password, favorite_team, birthdate]):
            self.send_json({"error": "必須項目を入力してください。"}, status=HTTPStatus.BAD_REQUEST)
            return

        password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO members (
                        name, email, password_hash, favorite_team, birthdate, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (name, email, password_hash, favorite_team, birthdate, timestamp()),
                )
                member_row = get_member(connection, cursor.lastrowid)
        except sqlite3.IntegrityError:
            self.send_json({"error": "このメールアドレスは既に登録されています。"}, status=HTTPStatus.CONFLICT)
            return

        self.send_json(
            {"message": "会員登録が完了しました。", "member": serialize_member(member_row)},
            status=HTTPStatus.CREATED,
        )

    def handle_login(self):
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        identifier = str(payload.get("identifier", payload.get("email", ""))).strip().lower()
        password = str(payload.get("password", "")).strip()
        if not identifier or not password:
            self.send_json({"error": "会員IDまたはメールアドレスとパスワードを入力してください。"}, status=HTTPStatus.BAD_REQUEST)
            return

        if identifier != MEMBER_LOGIN_EMAIL or password != MEMBER_LOGIN_PASSWORD:
            self.send_json({"error": "会員IDまたはメールアドレス、もしくはパスワードが正しくありません。"}, status=HTTPStatus.UNAUTHORIZED)
            return

        with get_connection() as connection:
            if identifier.isdigit():
                row = connection.execute(
                    """
                    SELECT id, name, email, favorite_team, favorite_player_id, birthdate, created_at, password_hash
                    FROM members
                    WHERE id = ?
                    """,
                    (int(identifier),),
                ).fetchone()
            else:
                row = connection.execute(
                    """
                    SELECT id, name, email, favorite_team, favorite_player_id, birthdate, created_at, password_hash
                    FROM members
                    WHERE lower(email) = ?
                    """,
                    (identifier.lower(),),
                ).fetchone()

        if not row:
            self.send_json({"error": "会員IDまたはメールアドレス、もしくはパスワードが正しくありません。"}, status=HTTPStatus.UNAUTHORIZED)
            return

        member_payload = serialize_member_auth(row)
        self.send_json({"message": "ログインしました。", "member": serialize_member(member_payload)})

    def handle_admin_login(self):
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        admin_id = str(payload.get("adminId", "")).strip()
        password = str(payload.get("password", "")).strip()
        if admin_id != ADMIN_ID or password != ADMIN_PASSWORD:
            self.send_json({"error": "管理者IDまたはパスワードが正しくありません。"}, status=HTTPStatus.UNAUTHORIZED)
            return

        self.send_json(
            {
                "message": "管理者ログインしました。",
                "admin": {"adminId": ADMIN_ID, "name": "B.LEAGUE Demo Admin"},
            }
        )

    def handle_follow_player(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            player_id = str(payload.get("playerId", "")).strip()
            player = get_catalog_item("players", player_id)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            with get_connection() as connection:
                get_member(connection, member_id)
                connection.execute(
                    "INSERT INTO player_follows (member_id, player_id, created_at) VALUES (?, ?, ?)",
                    (member_id, player_id, timestamp()),
                )
        except sqlite3.IntegrityError:
            self.send_json({"error": "この選手は既に応援中です。"}, status=HTTPStatus.CONFLICT)
            return
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"message": f"{player['name']} の応援を開始しました。"})

    def handle_set_favorite_player(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            player_id = str(payload.get("playerId", "")).strip()
            player = get_catalog_item("players", player_id)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            with get_connection() as connection:
                get_member(connection, member_id)
                connection.execute(
                    "UPDATE members SET favorite_player_id = ? WHERE id = ?",
                    (player_id, member_id),
                )
                connection.execute(
                    "INSERT OR IGNORE INTO player_follows (member_id, player_id, created_at) VALUES (?, ?, ?)",
                    (member_id, player_id, timestamp()),
                )
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"message": f"推し選手を {player['name']} に設定しました。"})

    def handle_complete_mission(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            mission_id = str(payload.get("missionId", "")).strip()
            note = str(payload.get("note", "")).strip()
            mission = get_catalog_item("missions", mission_id)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        photo_data_url = str(payload.get("photoDataUrl", "")).strip()
        image_name = str(payload.get("imageName", "")).strip()
        if mission.get("kind") == "photo":
            if not all([photo_data_url, image_name, note]) or len(note) < 20:
                self.send_json(
                    {"error": "写真ミッションは写真と20文字以上のコメントが必要です。"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

        try:
            with get_connection() as connection:
                get_member(connection, member_id)
                completed_at = timestamp()
                connection.execute(
                    """
                    INSERT INTO mission_completions (member_id, mission_id, note, reward_points, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (member_id, mission_id, note, mission.get("rewardPoints", 0), completed_at),
                )
                if mission.get("kind") == "photo":
                    connection.execute(
                        """
                        INSERT INTO mission_photo_posts (
                            member_id, mission_id, caption, image_name, image_data_url, created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (member_id, mission_id, note, image_name, photo_data_url, completed_at),
                    )
        except sqlite3.IntegrityError:
            self.send_json({"error": "このミッションは既に達成済みです。"}, status=HTTPStatus.CONFLICT)
            return
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"message": f"{mission['title']} を達成しました。"})

    def handle_board_post(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            category = str(payload.get("category", "")).strip()
            title = str(payload.get("title", "")).strip()
            body = str(payload.get("body", "")).strip()
            if not all([category, title, body]):
                raise ValueError("カテゴリ、タイトル、本文を入力してください。")
            if len(body) < 10:
                raise ValueError("本文は10文字以上で入力してください。")
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            with get_connection() as connection:
                member_row = get_member(connection, member_id)
                connection.execute(
                    """
                    INSERT INTO board_posts (
                        member_id, author_name, category, title, body, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (member_id, member_row["name"], category, title, body, timestamp()),
                )
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"message": "掲示板に投稿しました。"}, status=HTTPStatus.CREATED)

    def handle_purchase_pass(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            pass_id = str(payload.get("passId", "")).strip()
            plan_type = str(payload.get("planType", "")).strip()
            support_purpose = str(payload.get("supportPurpose", "")).strip()
            pass_item = get_catalog_item("passes", pass_id)
            plan_options = {item["id"]: item for item in pass_item.get("planOptions", [])}
            purpose_options = set(pass_item.get("purposeOptions", []))
            if plan_type not in plan_options:
                raise ValueError("購入プランを選択してください。")
            if support_purpose not in purpose_options:
                raise ValueError("使途を選択してください。")
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            with get_connection() as connection:
                get_member(connection, member_id)
                sold_count = connection.execute(
                    "SELECT COUNT(*) AS count FROM pass_purchases WHERE pass_id = ?",
                    (pass_id,),
                ).fetchone()["count"]
                if sold_count >= int(pass_item.get("slots", 0)):
                    raise ValueError("この共同育成パスは完売しました。")
                connection.execute(
                    """
                    INSERT INTO pass_purchases (
                        member_id, pass_id, price, plan_type, support_purpose, reward_points, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        member_id,
                        pass_id,
                        plan_options[plan_type]["price"],
                        plan_type,
                        support_purpose,
                        PASS_REWARD_POINTS,
                        timestamp(),
                    ),
                )
        except sqlite3.IntegrityError:
            self.send_json({"error": "この共同育成パスは既に購入済みです。"}, status=HTTPStatus.CONFLICT)
            return
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json(
            {
                "message": f"{pass_item['title']} を購入しました。",
                "receipt": {
                    "passTitle": pass_item["title"],
                    "planLabel": plan_options[plan_type]["label"],
                    "supportPurpose": support_purpose,
                    "price": plan_options[plan_type]["price"],
                },
            }
        )

    def handle_checkout_product(self):
        try:
            payload = self.read_json_body()
            member_id = int(payload.get("memberId", 0))
            product_id = str(payload.get("productId", "")).strip()
            billing_name = str(payload.get("billingName", "")).strip()
            card_number = "".join(ch for ch in str(payload.get("cardNumber", "")) if ch.isdigit())
            expiry = str(payload.get("expiry", "")).strip()
            cvc = "".join(ch for ch in str(payload.get("cvc", "")) if ch.isdigit())
            product = get_catalog_item("products", product_id)
            if not all([billing_name, card_number, expiry, cvc]):
                raise ValueError("決済情報をすべて入力してください。")
            if len(card_number) < 12:
                raise ValueError("カード番号が短すぎます。")
            if len(cvc) not in (3, 4):
                raise ValueError("CVC を確認してください。")
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        payment_brand = detect_card_brand(card_number)
        card_last4 = card_number[-4:]
        try:
            with get_connection() as connection:
                get_member(connection, member_id)
                connection.execute(
                    """
                    INSERT INTO product_orders (
                        member_id, product_id, price, reward_points, billing_name,
                        payment_brand, card_last4, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        member_id,
                        product_id,
                        product["price"],
                        PRODUCT_REWARD_POINTS,
                        billing_name,
                        payment_brand,
                        card_last4,
                        timestamp(),
                    ),
                )
        except sqlite3.IntegrityError:
            self.send_json({"error": "この商品は既に購入済みです。"}, status=HTTPStatus.CONFLICT)
            return
        except ValueError as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json(
            {
                "message": f"{product['name']} の決済が完了しました。",
                "receipt": {
                    "productName": product["name"],
                    "paymentBrand": payment_brand,
                    "cardLast4": card_last4,
                    "billingName": billing_name,
                    "price": product["price"],
                },
            }
        )

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Server running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
