# Hướng dẫn cấu hình đăng nhập Google / Facebook / X

Code OAuth (`routes/oauth.js`, `services/oauthProviders.js`) đã viết sẵn và hoạt động đúng — nó chỉ đang **thiếu client ID/secret thật** của từng nền tảng, nên chủ động trả lỗi `"... login is not configured on this server yet."` thay vì crash. Làm theo các bước dưới để có client ID/secret thật, rồi set vào Render.

Backend URL (Render): `https://super-league-backend.onrender.com`
Frontend URL (Vercel, dùng làm redirect sau khi login): `https://final-year-project-liart-theta.vercel.app`

Redirect URI cần khai báo với MỖI provider có dạng:
`https://super-league-backend.onrender.com/api/auth/<provider>/callback`

- Google: `https://super-league-backend.onrender.com/api/auth/google/callback`
- Facebook: `https://super-league-backend.onrender.com/api/auth/facebook/callback`
- X: `https://super-league-backend.onrender.com/api/auth/twitter/callback`

---

## 1. Google

1. Vào https://console.cloud.google.com/apis/credentials (tạo project mới nếu chưa có, ví dụ "Super League Pro").
2. Vào **OAuth consent screen** (bên trái) → chọn **External** → điền App name, User support email, Developer contact email → Save.
   - Ở bước "Scopes", thêm `email` và `profile` (openid mặc định đã có).
   - Nếu app đang ở trạng thái "Testing", chỉ những email bạn thêm vào **Test users** mới đăng nhập được — muốn ai cũng login được thì bấm **Publish App** (không cần Google duyệt với scope cơ bản này).
3. Vào **Credentials** → **Create Credentials** → **OAuth client ID** → Application type: **Web application**.
   - **Authorized redirect URIs**: dán đúng `https://super-league-backend.onrender.com/api/auth/google/callback`.
4. Bấm Create → Google hiện **Client ID** và **Client Secret**, copy lại 2 giá trị này.

**Set vào Render**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## 2. Facebook

1. Vào https://developers.facebook.com/apps → **Create App**.
2. Chọn use case **"Authenticate and request data from users with Facebook Login"** (hoặc "Consumer" tuỳ giao diện hiện tại) → đặt tên app → Create.
3. Trong app, vào **Facebook Login** → **Settings** (menu bên trái, dưới mục Products).
   - **Valid OAuth Redirect URIs**: dán `https://super-league-backend.onrender.com/api/auth/facebook/callback` → Save Changes.
4. Vào **App settings → Basic** → copy **App ID** và **App Secret** (bấm "Show" để hiện secret).

⚠️ **Lưu ý quan trọng**: app Facebook mới tạo mặc định ở chế độ **Development** — chỉ tài khoản Facebook được thêm làm **Admin/Developer/Tester** của app (trong **App roles → Roles**) mới đăng nhập được. Muốn public cho ai cũng login được, phải chuyển app sang **Live mode** (nút gạt ở đầu trang) — Facebook có thể yêu cầu điền thêm Privacy Policy URL trước khi cho Live.

**Set vào Render**: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`.

---

## 3. X (Twitter)

1. Vào https://developer.twitter.com/en/portal/dashboard — cần đăng ký tài khoản Developer (tier miễn phí "Free" đủ dùng cho OAuth 2.0 login, nhưng có thể cần Twitter duyệt vài giờ tới vài ngày).
2. Tạo **Project** → tạo **App** trong project đó.
3. Vào app → **User authentication settings** → **Set up**.
   - **App permissions**: Read (mặc định là đủ, vì chỉ lấy profile).
   - **Type of App**: **Web App, Automated App or Bot**.
   - **Callback URI / Redirect URL**: `https://super-league-backend.onrender.com/api/auth/twitter/callback`.
   - **Website URL**: `https://final-year-project-liart-theta.vercel.app`.
   - Save.
4. Sau khi save, X hiện **Client ID** và **Client Secret** của mục **OAuth 2.0** (⚠️ khác với "API Key/API Secret" ở trang Keys and Tokens — đó là OAuth 1.0a, code hiện tại KHÔNG dùng cái đó). Copy đúng Client ID/Secret của OAuth 2.0.

**Set vào Render**: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`.

---

## 4. Set biến môi trường trên Render

1. Vào Render Dashboard → chọn service **super-league-backend** → tab **Environment**.
2. Thêm 6 biến (Add Environment Variable), dán đúng giá trị đã copy ở trên:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `FACEBOOK_APP_ID`
   - `FACEBOOK_APP_SECRET`
   - `TWITTER_CLIENT_ID`
   - `TWITTER_CLIENT_SECRET`
3. Bấm **Save Changes** — Render tự động redeploy service với các biến mới (không cần push code, không cần đổi gì thêm — `OAUTH_CALLBACK_BASE_URL` không bắt buộc, code tự suy ra domain từ request nhờ `trust proxy` đã bật sẵn).

## 5. Kiểm tra

Sau khi Render deploy xong (trạng thái "Live"), vào trang web thật, bấm từng nút "Continue with Google/Facebook/X" — sẽ được redirect sang trang đăng nhập thật của nền tảng đó, đăng nhập xong tự quay lại app và vào thẳng trong game.

Nếu vẫn báo lỗi "not configured": kiểm tra lại đúng tên biến (phân biệt hoa/thường), không có khoảng trắng thừa khi paste, và đã bấm Save Changes trên Render.

Nếu OAuth trả về nhưng bị lỗi khác (ví dụ "Login failed. Please try again."): thường là do redirect URI khai báo trên Google/Facebook/X không khớp 100% với URL ở trên (kể cả có/thiếu dấu `/` cuối cũng tính là không khớp).
