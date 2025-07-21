# AlibabaCloud API Schema 与 HSF/Controller 的转换规则分析

本文档基于对 `amp-idea-plugin` 源码的分析，详细阐述了如何将 Java 代码（HSF 服务接口和 Spring Controller）转换为 Alibaba Cloud API Gateway 的标准 API Schema。

## 1. 总体转换流程

转换过程主要分为两个阶段：

1.  **代码解析到中间模型**:
    *   `ApiParser` 作为入口，负责解析一个 `PsiMethod` (Java 方法)。
    *   它会根据方法的注解（如 Spring Controller 的 `@RequestMapping` 或 HSF 的自定义注解）和配置，判断后端协议是 **HTTP** 还是 **HSF/DUBBO**。
    *   随后，它调用 `RequestParser`, `ResponseParser`, 和 `PathParser` 等模块，将 Java 方法的路径、参数、返回值等信息解析成一个中间模型 `Api` 对象。这个对象是对原始 Java 代码的结构化表示。

2.  **中间模型到 API Schema**:
    *   `AmpDataConvector` 类接收第一阶段生成的 `Api` 中间模型对象。
    *   它根据 `Api` 对象中的信息，特别是 `backendProtocolEnum` (后端协议类型) 和 `apiStyleEnum` (API 风格，如 RPC/RESTful)，将其转换为 `com.aliyun.openapi.spec.model.api.Api` 对象，这即是最终的 Alibaba Cloud API Schema。
    *   此过程会处理参数映射、响应结构包装、后端服务配置（BackendService）等关键步骤。

![image](https://user-images.githubusercontent.com/106393219/201522393-52711363-b31c-4249-880a-138510099712.png)

---

## 2. HSF 服务接口转换规则

当后端协议被识别为 `HSF` 或 `DUBBO` 时，遵循以下 RPC 风格的转换规则。

### 2.1. 请求 (Request) 转换

HSF 接口的请求转换主要由 `RequestParser.parseRpcParameters` 和 `AmpDataConvector.convertRpcBackendParameters` 处理。

**核心规则**:

1.  **参数扁平化 (Flattening)**:
    *   **单个复杂对象参数**: 如果 HSF 方法只有一个参数，且该参数是一个复杂的 POJO（Plain Old Java Object），转换器会默认将这个 POJO 的所有字段“扁平化”，即将每个字段作为 API 的一个独立请求参数。
    *   **多个参数**: 如果方法有多个参数，每个参数会作为 API 的一个独立请求参数。如果其中某个参数是复杂 POJO，它同样会被扁平化，其字段成为 API 的顶级参数。

2.  **参数位置 (`in`)**:
    *   对于 RPC 风格的 API，前端参数的位置 (`in`) 通常由插件配置决定，默认为 `formData` 或 `query`。
    *   `@AmpIn` 注解可以强制指定参数位置，例如 `@AmpIn("body")` 会将参数放入请求体。

3.  **参数索引 (`index`, `groupIndex`)**:
    *   当有多个参数或一个参数的多个字段被映射时，系统使用 `index` 和 `groupIndex` 来告诉后端 HSF 服务如何重组这些参数。
    *   `index`: 用于表示简单类型参数（如 `String`, `int` 等基本类型）在方法签名中的顺序（从1开始）。
    *   `groupIndex`: 用于表示一个参数是 POJO 的一级字段，并且这个 `groupIndex` 代表了该 POJO 在方法参数中的顺序（从1开始）。所有具有相同 `groupIndex` 的 API 参数将被聚合到同一个 POJO 对象中。
    *   这套索引机制确保了网关可以将前端传入的扁平化键值对，精确地反序列化为 HSF 方法所需的、具有正确顺序和结构的 Java 对象。

4.  **后端服务配置 (`BackendService`)**:
    *   `protocol`: 设置为 `HSF` 或 `DUBBO`。
    *   `service`: 设置为 HSF 接口的完全限定名 (e.g., `com.example.UserService`)。
    *   `method`: 设置为调用的方法名。
    *   `paramTypes`: 一个字符串列表，包含方法每个参数的 Java 类型，用于 HSF 泛化调用。

**示例**:

*   **Java HSF 接口**:
    ```java
    public class User {
        private String name;
        private int age;
    }
    public interface UserService {
        Result<User> findUser(String name, int age);
    }
    ```

*   **转换后的 API 请求参数**:
    *   `name`: in: `query`, type: `string`
    *   `age`: in: `query`, type: `integer`

### 2.2. 响应 (Response) 转换

响应转换由 `ResponseParser` 和 `AmpDataConvector.convertResponse` 处理。

**核心规则**:

1.  **返回类型解析**:
    *   `ResponseParser` 解析方法的返回类型 (`PsiType`)。
    *   它会自动“解包”常用的包装类，如 `java.util.concurrent.Future`, `reactor.core.publisher.Mono` 等，直接处理内部的实际业务对象。
    *   `@ApiResponseClassName` 注解可以用于强制指定一个不同于方法签名的返回类型。

2.  **结构体转换**:
    *   `KernelParser` 会递归地将返回的 Java 类型（通常是 POJO）转换为一个 `Struct` 对象。
    *   这个 `Struct` 对象包含了字段的类型、名称、描述等信息，形成了 API Schema 中的 `responses.200.schema` 部分。

3.  **响应包装 (`Wrapper`)**:
    *   系统支持对最终的响应 `Struct` 进行包装。例如，可以统一添加一个包含 `success`, `code`, `data` 等字段的外层结构。
    *   这个包装逻辑由 `AmpDataConvector.wrapResponse` 实现，包装结构体在插件配置中定义。
    *   `@ApiResponseWrapper` 注解可以为特定 API 指定一个预定义的包装器，或者使用 `__disable__` 来禁用默认包装。

---

## 3. Spring Controller 转换规则

当后端协议被识别为 `HTTP` 时，遵循以下 RESTful 风格的转换规则。

### 3.1. 请求 (Request) 转换

Controller 的请求转换涉及 `PathParser`, `RequestParser.parseHttpRequest`, 和 `AmpDataConvector.convertHttpBackendParameters`。

**核心规则**:

1.  **路径和方法 (`path`, `method`)**:
    *   `PathParser` 解析 `@RequestMapping`, `@GetMapping`, `@PostMapping` 等注解，提取出 API 的请求路径 (`path`) 和 HTTP 方法 (`method`)。
    *   类级别和方法级别的 `@RequestMapping` 路径会被拼接起来。
    *   `@AmpHttpPath` 和 `@AmpHttpMethod` 注解可以覆盖从 Spring 注解中解析出的值。

2.  **参数位置 (`in`)**:
    *   参数的位置是根据 Spring MVC 的标准注解自动推断的：
        *   `@PathVariable`: `in` 设置为 `path`。
        *   `@RequestHeader`: `in` 设置为 `header`。
        *   `@RequestParam`: `in` 设置为 `query`。
        *   `@RequestBody`: `in` 设置为 `body`。参数会被序列化为 JSON。
        *   无注解的 POJO 参数: 默认其所有字段作为 `query` 参数进行扁平化处理。
    *   `@AmpHttpIn` 注解可以覆盖上述默认行为。

3.  **请求体 (`RequestBody`)**:
    *   当一个参数被标记为 `@RequestBody` 时，`RequestParser` 会将其解析为一个 `body` 参数。
    *   API 的 `consumes` 字段会根据情况设置为 `application/json`, `application/x-www-form-urlencoded`, 或 `multipart/form-data`。

4.  **后端服务配置 (`BackendService`)**:
    *   `protocol`: 设置为 `HTTP`。
    *   `url`: 构建后端的完整请求 URL。它通常由一个基础地址（如 `http://www.demo.com`）和从 `@RequestMapping` 解析出的路径拼接而成。
    *   `httpMethod`: 设置为从注解中解析出的 HTTP 方法（`GET`, `POST` 等）。

**示例**:

*   **Java Spring Controller**:
    ```java
    @RestController
    @RequestMapping("/users")
    public class UserController {
        @GetMapping("/{id}")
        public User getUserById(@PathVariable String id, @RequestParam String version) { ... }

        @PostMapping
        public Result createUser(@RequestBody User user) { ... }
    }
    ```

*   **转换后的 API (`getUserById`)**:
    *   `path`: `/users/{id}`
    *   `method`: `get`
    *   **Parameters**:
        *   `id`: in: `path`, required: `true`
        *   `version`: in: `query`

*   **转换后的 API (`createUser`)**:
    *   `path`: `/users`
    *   `method`: `post`
    *   **Parameters**:
        *   `user`: in: `body`, (schema reflects the `User` class structure)

### 3.2. 响应 (Response) 转换

Controller 的响应转换规则与 HSF 的基本一致，同样由 `ResponseParser` 和 `AmpDataConvector` 处理。它会自动解包 `org.springframework.http.ResponseEntity` 等 Spring 特有的返回类型。

---

## 4. 通用数据类型转换规则

`KernelParser` 和 `DataTypeParser` 负责将 Java 类型转换为 JSON Schema 的数据类型，此规则对 HSF 和 Controller 通用。

| Java 类型 | 转换后 API Schema 类型 | 格式 (`format`) | 备注 |
| :--- | :--- | :--- | :--- |
| `String` | `string` | - | |
| `char`, `Character` | `string` | - | |
| `int`, `Integer` | `integer` | `int32` | |
| `long`, `Long` | `integer` | `int64` | |
| `float`, `Float` | `number` | `float` | |
| `double`, `Double` | `number` | `double` | |
| `boolean`, `Boolean` | `boolean` | - | |
| `byte`, `Byte` | `string` | `byte` | |
| `Date`, `LocalDate`, etc. | `string` | `date`, `date-time` | `format` 根据具体类型确定。 |
| `BigDecimal` | `number` | - | |
| `enum` | `string` | - | `enum` 的所有可选值会被提取并放入 `enumValues` 字段。 |
| `Array`, `List`, `Set` | `array` | - | `items` 字段会递归解析集合的泛型类型。 |
| `Map` | `object` | - | `additionalProperties` 字段会递归解析 Map 的 Value 类型。 |
| POJO (自定义类) | `object` | - | `properties` 字段会包含类中所有（未被忽略的）字段的递归解析结果。 |
| `org.springframework.web.multipart.MultipartFile` | `file` | - | 用于文件上传，通常在 `form-data` 请求体中使用。 |

**字段属性来源**:

*   **description**: 优先从 `@ApiModelProperty` (Swagger) 或 `@AmpDesc` 注解获取，其次是 JavaDoc 注释。
*   **required**: 从 `@NotNull`, `@NotBlank`, `@ApiModelProperty(required=true)` 等校验注解中推断。
*   **example**: 从 `@ApiModelProperty(example=...)` 或 `@AmpExample` 注解获取。
*   **defaultValue**: 从 `@AmpDefaultValue` 注解获取。
*   **validation**: `maxLength`, `minLength`, `maximum`, `minimum` 等校验规则从 JSR 303 注解（如 `@Size`, `@Max`, `@Min`）中解析。
