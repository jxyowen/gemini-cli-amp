# 从 AlibabaCloud API Schema 生成 Java 后端代码的规则分析

本文档旨在提供一个从 AlibabaCloud API Gateway 标准 Schema 反向生成 Java 后端代码（包括 HSF/Dubbo 接口和 Spring Controller）的规则和指南。该分析基于 `amp-idea-plugin` 的转换逻辑，并将其反转。

## 1. 核心识别与分发逻辑

生成过程的起点是解析 API Schema，其中最关键的部分是 `backendService` 对象。该对象的 `protocol` 字段是决定生成何种 Java 代码的核心依据。

*   **`backendService.protocol` = `HSF` 或 `DUBBO`**: 生成一个 Java **接口 (interface)**，遵循 RPC 开发模式。
*   **`backendService.protocol` = `HTTP`**: 生成一个 Java **类 (class)**，并使用 Spring Web 注解（如 `@RestController`, `@RequestMapping` 等）来构建一个 Controller。

因此，代码生成器首先需要读取 `protocol` 字段，然后根据其值将生成任务分发到不同的处理器。

![image](https://user-images.githubusercontent.com/106393219/201522831-01e5124a-754b-410a-871a-111181818059.png)

---

## 2. 生成 HSF/Dubbo 服务接口

当 `backendService.protocol` 为 `HSF` 或 `DUBBO` 时，目标是生成一个纯粹的 Java 接口。

### 2.1. 接口和方法签名

1.  **接口名称**: 由 `backendService.service` 字段直接决定。例如，`"service": "com.aliyun.amp.demo.api.DemoService"` 将生成 `public interface DemoService { ... }`。

2.  **方法名称**: 由 `backendService.method` 字段决定。

3.  **方法返回类型**: 通过解析 `responses.200.schema` 对象生成。生成器需要递归地将 Schema 中的 `Struct` 对象（包括其 `type`, `format`, `properties`, `items` 等）映射回 Java 类型（详见第 4 节的类型映射表）。
    *   如果 Schema 结构暗示了某种包装（例如，包含 `success`, `data` 等字段），生成器可能会生成一个泛型的 `Result<T>` 类，其中 `T` 是业务数据的具体类型。

### 2.2. 方法参数生成

这是 RPC 风格生成中最复杂的部分，因为它需要将 API Schema 中扁平化的参数列表重新组合成 Java 方法的参数。

**核心规则**:

1.  **参数重组依据**: `parameter.schema` 对象中的 `groupIndex` 和 `index` 字段是重组参数的关键。
    *   `index`: 用于表示简单类型参数（如 `String`, `int` 等基本类型）在方法签名中的顺序（从1开始）。
    *   `groupIndex`: 用于表示一个参数是 POJO 的一级字段，并且这个 `groupIndex` 代表了该 POJO 在方法参数中的顺序（从1开始）。所有具有相同 `groupIndex` 的 API 参数将被聚合到同一个 POJO 对象中。

2.  **参数类型来源**: `backendService.paramTypes` 数组提供了最准确的参数类型信息。它是一个包含了每个参数完全限定名的字符串列表。生成器应优先使用此列表来确定方法签名。

3.  **生成逻辑**:
    *   遍历 API Schema 中的 `parameters` 列表。
    *   使用一个 Map，以 `groupIndex` 为键，将参数分组。
    *   **对于有 `groupIndex` 的参数**: 这些参数属于一个 POJO。需要为这个 `groupIndex` 生成一个新的 Java 类，类名可以根据上下文推断（例如，使用 `paramTypes` 中对应的类名）。该 POJO 的字段由所有共享此 `groupIndex` 的 API 参数构成。
    *   **对于没有 `groupIndex` 的参数**: 这些是方法的直接参数（如 `String`, `int` 等基本类型或简单对象）。
    *   最终，根据 `paramTypes` 数组和解析出的参数，构建完整的方法签名。

**示例**:

*   **API Schema (部分)**:
    ```json
    {
      "backendService": {
        "protocol": "HSF",
        "service": "com.aliyun.amp.demo.api.UserService",
        "method": "updateUser",
        "paramTypes": ["java.lang.String", "com.aliyun.amp.demo.model.UserDTO"]
      },
      "parameters": [
        { "name": "userId", "in": "query", "schema": { "type": "string", "index": 1 } },
        { "name": "name", "in": "query", "schema": { "type": "string", "groupIndex": 2 } },
        { "name": "age", "in": "query", "schema": { "type": "integer", "groupIndex": 2 } }
      ]
    }
    ```

*   **生成的 Java 代码**:
    ```java
    // 需要生成 UserDTO.java
    public class UserDTO {
        private String name;
        private int age;
        // getters and setters
    }

    // 生成的 HSF 接口
    public interface UserService {
        Result<Void> updateUser(String userId, UserDTO user);
    }
    ```

---

## 3. 生成 Spring Controller

当 `backendService.protocol` 为 `HTTP` 时，目标是生成一个带有 Spring Web 注解的 Java Controller 类。

### 3.1. 类和方法注解

1.  **类注解**: 生成的类应标记为 `@RestController`。
    *   可以从 API 的 `path` 中提取公共前缀作为类级别的 `@RequestMapping`。例如，如果 `path` 是 `/api/v1/users/{id}`，则类注解可以是 `@RequestMapping("/api/v1/users")`。

2.  **方法注解**: 由 API 的 `path` 和 `method` 字段决定。
    *   `method: "get"` 对应 `@GetMapping`。
    *   `method: "post"` 对应 `@PostMapping`。
    *   注解的值是 `path` 中剩余的部分。例如，对于 `/api/v1/users/{id}`，方法注解是 `@GetMapping("/{id}")`。

### 3.2. 方法签名和参数

1.  **方法名称**: Schema 中没有直接提供方法名。可以根据 HTTP 方法和路径生成一个描述性的名称，例如 `getUserById` 或 `createUser`。

2.  **返回类型**: 与 HSF 规则相同，通过解析 `responses.200.schema` 生成。对于 Spring，可以考虑生成 `ResponseEntity<T>` 来提供更灵活的 HTTP 响应控制。

3.  **方法参数**: 由 `parameters` 列表决定，主要依据是每个参数的 `in` 字段。
    *   `in: "path"` -> 生成带 `@PathVariable` 的参数。
    *   `in: "query"` -> 生成带 `@RequestParam` 的参数。
    *   `in: "header"` -> 生成带 `@RequestHeader` 的参数。
    *   `in: "body"` -> 生成带 `@RequestBody` 的参数。该参数的类型是一个需要根据其 `schema` 定义生成的 POJO。
    *   `in: "formData"` -> 如果是文件上传 (`type: "file"`)，则生成 `MultipartFile` 类型的参数。否则，生成带 `@RequestParam` 的参数。

**示例**:

*   **API Schema (部分)**:
    ```json
    {
      "path": "/users/{id}",
      "method": "put",
      "backendService": { "protocol": "HTTP", ... },
      "parameters": [
        { "name": "id", "in": "path", "schema": { "type": "string" }, "required": true },
        { "name": "token", "in": "header", "schema": { "type": "string" } },
        { "name": "user", "in": "body", "schema": { "$ref": "#/components/schemas/User" } }
      ]
    }
    ```

*   **生成的 Java 代码**:
    ```java
    @RestController
    @RequestMapping("/users")
    public class UserController {

        @PutMapping("/{id}")
        public ResponseEntity<User> updateUser(
            @PathVariable String id,
            @RequestHeader(required = false) String token,
            @RequestBody User user) {
            // ... implementation
        }
    }
    ```

---

## 4. 通用数据类型映射规则 (Schema 到 Java)

无论是生成 HSF 接口还是 Controller，将 Schema 类型映射到 Java 类型的规则是通用的。

| API Schema 类型 | 格式 (`format`) | 生成的 Java 类型 | 备注 |
| :--- | :--- | :--- | :--- |
| `string` | (无) | `String` | |
| `string` | `byte` | `byte[]` | |
| `string` | `date` | `java.time.LocalDate` | |
| `string` | `date-time` | `java.util.Date` 或 `java.time.LocalDateTime` | 这是一个设计选择。 |
| `integer` | `int32` | `int` / `Integer` | |
| `integer` | `int64` | `long` / `Long` | |
| `number` | `float` | `float` / `Float` | |
| `number` | `double` | `double` / `Double` | |
| `boolean` | (无) | `boolean` / `Boolean` | |
| `array` | (无) | `java.util.List<T>` | `T` 是通过递归解析 `items` 字段的 Schema 生成的类型。 |
| `object` | (无) | `java.util.Map<String, V>` 或 **POJO** | 如果存在 `properties`，则生成一个 POJO 类。如果存在 `additionalProperties`，则生成一个 Map，其中 `V` 是递归解析 `additionalProperties` 的 Schema 生成的类型。 |
| `file` | (无) | `org.springframework.web.multipart.MultipartFile` | 仅适用于 HTTP `formData` 请求。 |
