# Database Schema

## `stores`

``` sql
CREATE TABLE stores (
    store_id        BIGINT PRIMARY KEY,
    store_code      VARCHAR(20) UNIQUE NOT NULL,
    store_name      VARCHAR(100) NOT NULL,
    location        VARCHAR(255)
);
```

------------------------------------------------------------------------

## `employees`

``` sql
CREATE TABLE employees (
    employee_id     BIGINT PRIMARY KEY,
    employee_number VARCHAR(20) UNIQUE NOT NULL,
    first_name      VARCHAR(50),
    last_name       VARCHAR(50),
    email           VARCHAR(100)
);
```

------------------------------------------------------------------------

## `store_manager_assignment`

``` sql
CREATE TABLE store_manager_assignment (
    assignment_id   BIGINT PRIMARY KEY,
    store_id        BIGINT NOT NULL,
    employee_id     BIGINT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE,

    FOREIGN KEY (store_id)
        REFERENCES stores(store_id),

    FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id)
);
```

------------------------------------------------------------------------

## `areas`

``` sql
CREATE TABLE areas (
    area_id         BIGINT PRIMARY KEY,
    store_id        BIGINT NOT NULL,
    area_name       VARCHAR(100) NOT NULL,
    description     TEXT,

    FOREIGN KEY (store_id)
        REFERENCES stores(store_id)
);
```

------------------------------------------------------------------------

## `products`

``` sql
CREATE TABLE products (
    product_id      BIGINT PRIMARY KEY,
    sku             VARCHAR(30) UNIQUE NOT NULL,
    product_name    VARCHAR(255) NOT NULL,
    category        VARCHAR(100)
);
```

------------------------------------------------------------------------

## `area_products`

``` sql
CREATE TABLE area_products (
    area_id         BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,

    PRIMARY KEY (area_id, product_id),

    FOREIGN KEY (area_id)
        REFERENCES areas(area_id),

    FOREIGN KEY (product_id)
        REFERENCES products(product_id)
);
```
